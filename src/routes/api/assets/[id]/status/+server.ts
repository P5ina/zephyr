import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getHistory, getImage, queuePrompt, buildWorkflow } from '$lib/server/comfyui-client';
import { releaseInstance, markInstanceFailed, getCurrentInstance } from '$lib/server/instance-manager';
import { generatePBRMaps, uploadToBlob } from '$lib/server/asset-generation';
import type { RequestHandler } from './$types';

const MAX_RETRIES = 3;

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const asset = await db.query.assetGeneration.findFirst({
		where: and(
			eq(table.assetGeneration.id, params.id),
			eq(table.assetGeneration.userId, locals.user.id),
		),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	// Already completed or failed
	if (asset.status === 'completed' || asset.status === 'failed') {
		return json({
			status: asset.status,
			resultUrls: asset.resultUrls,
			pbrUrls: asset.pbrUrls,
			seed: asset.seed,
			errorMessage: asset.errorMessage,
		});
	}

	// Handle queued jobs - instance might be ready now
	if (asset.status === 'queued' || asset.status === 'pending') {
		return await handleQueuedJob(asset);
	}

	// Handle processing jobs
	if (asset.status === 'processing') {
		return await handleProcessingJob(asset);
	}

	// Post-processing in progress
	if (asset.status === 'post_processing') {
		return json({ status: 'post_processing' });
	}

	return json({ status: asset.status });
};

async function handleQueuedJob(asset: table.AssetGeneration) {
	// Check if instance is ready
	const instance = asset.vastInstanceId
		? await db.query.vastInstance.findFirst({
				where: eq(table.vastInstance.id, asset.vastInstanceId),
			})
		: await getCurrentInstance();

	if (!instance) {
		return json({ status: 'queued', message: 'Waiting for instance' });
	}

	if (instance.status === 'creating' || instance.status === 'starting') {
		return json({ status: 'queued', message: 'Instance starting up' });
	}

	if (instance.status === 'failed' || instance.status === 'stopped') {
		// Instance failed or stopped, try to get a new one or fail the job
		if (asset.retryCount >= MAX_RETRIES) {
			await db
				.update(table.assetGeneration)
				.set({
					status: 'failed',
					errorMessage: 'Instance failed to start after multiple retries',
				})
				.where(eq(table.assetGeneration.id, asset.id));

			// Refund tokens
			await refundTokens(asset);

			return json({
				status: 'failed',
				errorMessage: 'Instance failed to start after multiple retries',
			});
		}

		// Increment retry and try again later
		await db
			.update(table.assetGeneration)
			.set({
				retryCount: sql`${table.assetGeneration.retryCount} + 1`,
				vastInstanceId: null,
			})
			.where(eq(table.assetGeneration.id, asset.id));

		return json({ status: 'queued', message: 'Retrying with new instance' });
	}

	// Instance is ready, queue the job
	if ((instance.status === 'ready' || instance.status === 'busy') && instance.httpHost && instance.httpPort) {
		try {
			const workflow = buildWorkflow({
				assetType: asset.assetType as 'sprite' | 'pixel_art' | 'texture',
				prompt: asset.prompt,
				negativePrompt: asset.negativePrompt || undefined,
				width: asset.width,
				height: asset.height,
			});

			const promptId = await queuePrompt(instance.httpHost, instance.httpPort, workflow);

			await db
				.update(table.assetGeneration)
				.set({
					status: 'processing',
					vastInstanceId: instance.id,
					comfyuiPromptId: promptId,
				})
				.where(eq(table.assetGeneration.id, asset.id));

			await db
				.update(table.vastInstance)
				.set({
					status: 'busy',
					currentJobId: asset.id,
					lastActivityAt: new Date(),
				})
				.where(eq(table.vastInstance.id, instance.id));

			return json({ status: 'processing' });
		} catch (err) {
			console.error('Failed to queue job:', err);
			return json({ status: 'queued', message: 'Failed to queue, will retry' });
		}
	}

	return json({ status: 'queued' });
}

async function handleProcessingJob(asset: table.AssetGeneration) {
	if (!asset.vastInstanceId || !asset.comfyuiPromptId) {
		return json({ status: 'processing', message: 'Waiting for job info' });
	}

	const instance = await db.query.vastInstance.findFirst({
		where: eq(table.vastInstance.id, asset.vastInstanceId),
	});

	// Check if instance is gone, stopped, or failed
	const instanceLost = !instance ||
		!instance.httpHost ||
		!instance.httpPort ||
		instance.status === 'stopped' ||
		instance.status === 'failed';

	if (instanceLost) {
		// Instance gone, mark for retry
		if (asset.retryCount >= MAX_RETRIES) {
			await db
				.update(table.assetGeneration)
				.set({
					status: 'failed',
					errorMessage: 'Instance lost during processing',
				})
				.where(eq(table.assetGeneration.id, asset.id));

			await refundTokens(asset);

			return json({ status: 'failed', errorMessage: 'Instance lost during processing' });
		}

		await db
			.update(table.assetGeneration)
			.set({
				status: 'queued',
				retryCount: sql`${table.assetGeneration.retryCount} + 1`,
				vastInstanceId: null,
				comfyuiPromptId: null,
			})
			.where(eq(table.assetGeneration.id, asset.id));

		return json({ status: 'queued', message: 'Retrying job' });
	}

	try {
		const history = await getHistory(instance.httpHost, instance.httpPort, asset.comfyuiPromptId);

		if (!history) {
			// Job still running
			return json({ status: 'processing' });
		}

		if (!history.status?.completed) {
			// Check for errors
			const errorMsg = history.status?.messages?.find(([type]) => type === 'execution_error');
			if (errorMsg) {
				throw new Error('Workflow execution error');
			}
			return json({ status: 'processing' });
		}

		// Job completed, process results
		await db
			.update(table.assetGeneration)
			.set({ status: 'post_processing' })
			.where(eq(table.assetGeneration.id, asset.id));

		// Find output images
		let imageData: Buffer | null = null;
		let seed = -1;

		for (const [_nodeId, output] of Object.entries(history.outputs)) {
			if (output.images && output.images.length > 0) {
				const img = output.images[0];
				imageData = await getImage(
					instance.httpHost,
					instance.httpPort,
					img.filename,
					img.subfolder,
					img.type,
				);
				break;
			}
		}

		if (!imageData) {
			throw new Error('No output image found');
		}

		// Upload to blob storage
		const rawUrl = await uploadToBlob(imageData, `assets/${asset.id}/raw.png`);

		let pbrUrls = undefined;
		if (asset.assetType === 'texture') {
			const pbr = await generatePBRMaps(imageData);
			pbrUrls = {
				baseColor: rawUrl,
				normal: await uploadToBlob(pbr.normal, `assets/${asset.id}/normal.png`),
				roughness: await uploadToBlob(pbr.roughness, `assets/${asset.id}/roughness.png`),
				height: await uploadToBlob(pbr.height, `assets/${asset.id}/height.png`),
			};
		}

		await db
			.update(table.assetGeneration)
			.set({
				status: 'completed',
				resultUrls: { raw: rawUrl },
				pbrUrls,
				seed,
				completedAt: new Date(),
			})
			.where(eq(table.assetGeneration.id, asset.id));

		// Release the instance
		await releaseInstance(instance.id);

		return json({
			status: 'completed',
			resultUrls: { raw: rawUrl },
			pbrUrls,
			seed,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Processing failed';

		// Check if we should retry
		if (asset.retryCount < MAX_RETRIES) {
			await db
				.update(table.assetGeneration)
				.set({
					status: 'queued',
					retryCount: sql`${table.assetGeneration.retryCount} + 1`,
					vastInstanceId: null,
					comfyuiPromptId: null,
				})
				.where(eq(table.assetGeneration.id, asset.id));

			// Mark instance as potentially problematic
			await markInstanceFailed(instance.id, message);

			return json({ status: 'queued', message: 'Retrying job' });
		}

		await db
			.update(table.assetGeneration)
			.set({
				status: 'failed',
				errorMessage: message,
			})
			.where(eq(table.assetGeneration.id, asset.id));

		await releaseInstance(instance.id);
		await refundTokens(asset);

		return json({ status: 'failed', errorMessage: message });
	}
}

async function refundTokens(asset: table.AssetGeneration) {
	// Refund tokens on final failure
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${asset.tokenCost}`,
		})
		.where(eq(table.user.id, asset.userId));
}
