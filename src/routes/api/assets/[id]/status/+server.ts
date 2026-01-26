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

	let asset = await db.query.assetGeneration.findFirst({
		where: and(
			eq(table.assetGeneration.id, params.id),
			eq(table.assetGeneration.userId, locals.user.id),
		),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	// If job is processing and has a RunPod job ID, check RunPod status
	if (
		asset.runpodJobId &&
		(asset.status === 'pending' || asset.status === 'processing')
	) {
		try {
			const runpodStatus = await getJobStatus(asset.runpodJobId);

			// If RunPod says the job failed or was cancelled, update our DB
			if (runpodStatus.status === 'FAILED' || runpodStatus.status === 'CANCELLED') {
				// Refund tokens
				const regularTokens = asset.tokenCost - asset.bonusTokenCost;
				await db
					.update(table.user)
					.set({
						tokens: sql`${table.user.tokens} + ${regularTokens}`,
						bonusTokens: sql`${table.user.bonusTokens} + ${asset.bonusTokenCost}`,
					})
					.where(eq(table.user.id, asset.userId));

				// Mark as failed
				await db
					.update(table.assetGeneration)
					.set({
						status: 'failed',
						errorMessage: runpodStatus.error || 'Job failed on worker',
					})
					.where(eq(table.assetGeneration.id, asset.id));

				// Refetch updated asset
				asset = (await db.query.assetGeneration.findFirst({
					where: eq(table.assetGeneration.id, params.id),
				}))!;
			}
		} catch (e) {
			// Ignore RunPod API errors, just return current DB state
			console.error('Failed to check RunPod status:', e);
		}
	}

	// Return full asset so UI can update properly
	return json(asset);
};
