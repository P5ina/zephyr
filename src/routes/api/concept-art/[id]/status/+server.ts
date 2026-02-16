import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getConceptArtJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	let gen = await db.query.conceptArtGeneration.findFirst({
		where: and(
			eq(table.conceptArtGeneration.id, params.id),
			eq(table.conceptArtGeneration.userId, locals.user.id),
		),
	});

	if (!gen) {
		error(404, 'Generation not found');
	}

	// Check fal.ai status if we have a request ID and need to sync state
	const needsFalCheck =
		gen.falRequestId &&
		(gen.status === 'pending' ||
			gen.status === 'processing' ||
			(gen.status === 'completed' && !gen.imageUrl));

	if (needsFalCheck) {
		try {
			const falStatus = await getConceptArtJobStatus(gen.falRequestId!);

			if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
				if (gen.status !== 'processing') {
					await db
						.update(table.conceptArtGeneration)
						.set({
							status: 'processing',
							currentStage: falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(eq(table.conceptArtGeneration.id, gen.id));

					gen = (await db.query.conceptArtGeneration.findFirst({
						where: eq(table.conceptArtGeneration.id, params.id),
					}))!;
				}
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				if (gen.status !== 'failed') {
					const regularTokens = gen.tokenCost - gen.bonusTokenCost;
					await db
						.update(table.user)
						.set({
							tokens: sql`${table.user.tokens} + ${regularTokens}`,
							bonusTokens: sql`${table.user.bonusTokens} + ${gen.bonusTokenCost}`,
						})
						.where(eq(table.user.id, gen.userId));
				}

				await db
					.update(table.conceptArtGeneration)
					.set({
						status: 'failed',
						errorMessage: falStatus.error || 'Job failed on fal.ai',
					})
					.where(eq(table.conceptArtGeneration.id, gen.id));

				gen = (await db.query.conceptArtGeneration.findFirst({
					where: eq(table.conceptArtGeneration.id, params.id),
				}))!;
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				if (falStatus.output.imageUrl && !gen.imageUrl) {
					await db
						.update(table.conceptArtGeneration)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							imageUrl: falStatus.output.imageUrl,
							seed: falStatus.output.seed || null,
							completedAt: new Date(),
						})
						.where(eq(table.conceptArtGeneration.id, gen.id));

					gen = (await db.query.conceptArtGeneration.findFirst({
						where: eq(table.conceptArtGeneration.id, params.id),
					}))!;
				}
			}
		} catch (e) {
			console.error('Failed to check fal.ai status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: gen.id,
		status: gen.status,
	};

	if (gen.status === 'pending') {
		response.statusMessage = gen.currentStage || 'Queued for processing...';
		response.progress = 0;
	}

	if (gen.status === 'processing') {
		response.progress = gen.progress;
		response.statusMessage = gen.currentStage || 'Processing...';
	}

	if (gen.status === 'completed') {
		response.progress = 100;
		response.imageUrl = gen.imageUrl;
	}

	if (gen.status === 'failed') {
		response.error = gen.errorMessage;
	}

	return json(response);
};
