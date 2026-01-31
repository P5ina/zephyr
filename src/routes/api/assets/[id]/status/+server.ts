import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getSpriteJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	// Build ownership condition
	let ownershipCondition;
	if (locals.user) {
		ownershipCondition = eq(table.assetGeneration.userId, locals.user.id);
	} else if (locals.guestSession) {
		ownershipCondition = eq(table.assetGeneration.guestSessionId, locals.guestSession.id);
	} else {
		error(401, 'Unauthorized');
	}

	let asset = await db.query.assetGeneration.findFirst({
		where: and(
			eq(table.assetGeneration.id, params.id),
			ownershipCondition,
		),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	// Check fal.ai status if we have a request ID and need to sync state
	const needsFalCheck =
		asset.runpodJobId &&
		(asset.status === 'pending' ||
			asset.status === 'processing' ||
			(asset.status === 'completed' && !asset.resultUrls?.processed));

	if (needsFalCheck) {
		try {
			const falStatus = await getSpriteJobStatus(asset.runpodJobId!);

			if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
				if (asset.status !== 'processing') {
					await db
						.update(table.assetGeneration)
						.set({
							status: 'processing',
							currentStage: falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(eq(table.assetGeneration.id, asset.id));

					asset = (await db.query.assetGeneration.findFirst({
						where: eq(table.assetGeneration.id, params.id),
					}))!;
				}
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				// Refund tokens only if this is a user-owned asset (not a guest generation)
				if (asset.status !== 'failed' && asset.userId) {
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
						errorMessage: falStatus.error || 'Job failed on fal.ai',
					})
					.where(eq(table.assetGeneration.id, asset.id));

				asset = (await db.query.assetGeneration.findFirst({
					where: eq(table.assetGeneration.id, params.id),
				}))!;
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				if (falStatus.output.processedUrl && !asset.resultUrls?.processed) {
					await db
						.update(table.assetGeneration)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							resultUrls: {
								raw: falStatus.output.rawUrl || undefined,
								processed: falStatus.output.processedUrl,
							},
							seed: falStatus.output.seed || null,
							completedAt: new Date(),
						})
						.where(eq(table.assetGeneration.id, asset.id));

					asset = (await db.query.assetGeneration.findFirst({
						where: eq(table.assetGeneration.id, params.id),
					}))!;
				}
			}
		} catch (e) {
			console.error('Failed to check fal.ai status:', e);
		}
	}

	// Return full asset so UI can update properly
	return json(asset);
};
