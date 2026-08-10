import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getJobStatus } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	let texture = await db.query.textureGeneration.findFirst({
		where: and(
			eq(table.textureGeneration.id, params.id),
			eq(table.textureGeneration.userId, locals.user.id),
		),
	});

	if (!texture) {
		error(404, 'Texture not found');
	}

	// Check RunPod status if we have a job ID and need to sync state
	const needsRunpodCheck =
		texture.runpodJobId &&
		(texture.status === 'pending' ||
			texture.status === 'processing' ||
			(texture.status === 'completed' && !texture.basecolorUrl));

	if (needsRunpodCheck) {
		try {
			const runpodStatus = await getJobStatus(texture.runpodJobId as string);

			if (runpodStatus.status === 'IN_PROGRESS') {
				if (texture.status !== 'processing') {
					await db
						.update(table.textureGeneration)
						.set({
							status: 'processing',
							currentStage: 'Processing...',
						})
						.where(eq(table.textureGeneration.id, texture.id));

					const refreshedTexture = await db.query.textureGeneration.findFirst({
						where: eq(table.textureGeneration.id, params.id),
					});
					if (!refreshedTexture) error(404, 'Texture not found');
					texture = refreshedTexture;
				}
			} else if (
				runpodStatus.status === 'FAILED' ||
				runpodStatus.status === 'CANCELLED'
			) {
				// `texture` was read before the RunPod round trip and cannot gate the
				// refund: every concurrent poll holds the same pre-fetch copy, and a
				// Cancel that lands mid-flight settles the row without this one
				// noticing. The claim below makes the `-> failed` transition itself
				// the gate, so N pollers plus a cancel credit the cost exactly once.
				// A null claim means the row was already terminal — someone else
				// paid it back, so credit nothing and carry on reporting status.
				await claimJobAndRefund({
					job: table.textureGeneration,
					jobId: texture.id,
					errorMessage: runpodStatus.error || 'Job failed on worker',
					claimableWhen: NOT_TERMINAL,
				});

				const failedTexture = await db.query.textureGeneration.findFirst({
					where: eq(table.textureGeneration.id, params.id),
				});
				if (!failedTexture) error(404, 'Texture not found');
				texture = failedTexture;
			} else if (runpodStatus.status === 'COMPLETED' && runpodStatus.output) {
				const raw = runpodStatus.output as Record<string, unknown>;
				// Unwrap nested {result: {...}} from old worker format
				const output = (raw.result as Record<string, unknown>) ?? raw;
				if (output.basecolor_url && !texture.basecolorUrl) {
					await db
						.update(table.textureGeneration)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							basecolorUrl: output.basecolor_url as string,
							normalUrl: (output.normal_url as string) || null,
							roughnessUrl: (output.roughness_url as string) || null,
							metallicUrl: (output.metallic_url as string) || null,
							seed: (output.seed as number) || null,
							completedAt: new Date(),
						})
						.where(eq(table.textureGeneration.id, texture.id));

					const completedTexture = await db.query.textureGeneration.findFirst({
						where: eq(table.textureGeneration.id, params.id),
					});
					if (!completedTexture) error(404, 'Texture not found');
					texture = completedTexture;
				}
			}
		} catch (e) {
			console.error('Failed to check RunPod status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: texture.id,
		status: texture.status,
		runpodJobId: texture.runpodJobId,
	};

	if (texture.status === 'pending') {
		response.statusMessage = texture.currentStage || 'Queued for processing...';
		response.progress = 0;
	}

	if (texture.status === 'processing') {
		response.progress = texture.progress;
		response.statusMessage = texture.currentStage || 'Processing...';
	}

	if (texture.status === 'completed') {
		response.progress = 100;
		response.textures = {
			basecolor: texture.basecolorUrl,
			normal: texture.normalUrl,
			roughness: texture.roughnessUrl,
			metallic: texture.metallicUrl,
		};
	}

	if (texture.status === 'failed') {
		response.error = texture.errorMessage;
	}

	return json(response);
};
