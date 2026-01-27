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

	// Check RunPod status if we have a job ID and need to sync state
	const needsRunpodCheck =
		asset.runpodJobId &&
		(asset.status === 'pending' ||
			asset.status === 'processing' ||
			(asset.status === 'completed' && !asset.resultUrls?.processed));

	if (needsRunpodCheck) {
		try {
			const runpodStatus = await getJobStatus(asset.runpodJobId!);

			if (runpodStatus.status === 'IN_PROGRESS') {
				if (asset.status !== 'processing') {
					await db
						.update(table.assetGeneration)
						.set({
							status: 'processing',
							currentStage: 'Processing...',
						})
						.where(eq(table.assetGeneration.id, asset.id));

					asset = (await db.query.assetGeneration.findFirst({
						where: eq(table.assetGeneration.id, params.id),
					}))!;
				}
			} else if (runpodStatus.status === 'FAILED' || runpodStatus.status === 'CANCELLED') {
				if (asset.status !== 'failed') {
					const regularTokens = asset.tokenCost - asset.bonusTokenCost;
					await db
						.update(table.user)
						.set({
							tokens: sql`${table.user.tokens} + ${regularTokens}`,
							bonusTokens: sql`${table.user.bonusTokens} + ${asset.bonusTokenCost}`,
						})
						.where(eq(table.user.id, asset.userId));
				}

				await db
					.update(table.assetGeneration)
					.set({
						status: 'failed',
						errorMessage: runpodStatus.error || 'Job failed on worker',
					})
					.where(eq(table.assetGeneration.id, asset.id));

				asset = (await db.query.assetGeneration.findFirst({
					where: eq(table.assetGeneration.id, params.id),
				}))!;
			} else if (runpodStatus.status === 'COMPLETED' && runpodStatus.output) {
				const output = runpodStatus.output as Record<string, unknown>;
				if (output.processed_url && !asset.resultUrls?.processed) {
					await db
						.update(table.assetGeneration)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							resultUrls: {
								raw: (output.raw_url as string) || undefined,
								processed: output.processed_url as string,
							},
							seed: (output.seed as number) || null,
							completedAt: new Date(),
						})
						.where(eq(table.assetGeneration.id, asset.id));

					asset = (await db.query.assetGeneration.findFirst({
						where: eq(table.assetGeneration.id, params.id),
					}))!;
				}
			}
		} catch (e) {
			console.error('Failed to check RunPod status:', e);
		}
	}

	// Return full asset so UI can update properly
	return json(asset);
};
