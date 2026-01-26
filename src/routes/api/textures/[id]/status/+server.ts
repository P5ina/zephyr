import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
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

	// If job is processing and has a RunPod job ID, check RunPod status
	if (
		texture.runpodJobId &&
		(texture.status === 'pending' || texture.status === 'processing')
	) {
		try {
			const runpodStatus = await getJobStatus(texture.runpodJobId);

			// If RunPod says the job failed or was cancelled, update our DB
			if (runpodStatus.status === 'FAILED' || runpodStatus.status === 'CANCELLED') {
				// Refund tokens
				const regularTokens = texture.tokenCost - texture.bonusTokenCost;
				await db
					.update(table.user)
					.set({
						tokens: sql`${table.user.tokens} + ${regularTokens}`,
						bonusTokens: sql`${table.user.bonusTokens} + ${texture.bonusTokenCost}`,
					})
					.where(eq(table.user.id, texture.userId));

				// Mark as failed
				await db
					.update(table.textureGeneration)
					.set({
						status: 'failed',
						errorMessage: runpodStatus.error || 'Job failed on worker',
					})
					.where(eq(table.textureGeneration.id, texture.id));

				// Refetch updated texture
				texture = (await db.query.textureGeneration.findFirst({
					where: eq(table.textureGeneration.id, params.id),
				}))!;
			}
		} catch (e) {
			// Ignore RunPod API errors, just return current DB state
			console.error('Failed to check RunPod status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: texture.id,
		status: texture.status,
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
			height: texture.heightUrl,
		};
	}

	if (texture.status === 'failed') {
		response.error = texture.errorMessage;
	}

	return json(response);
};
