import { error, json } from '@sveltejs/kit';
import { and, eq, ne, notInArray, type SQL, sql } from 'drizzle-orm';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getSpriteJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	// Build ownership condition
	let ownershipCondition: SQL | undefined;
	if (locals.user) {
		ownershipCondition = eq(table.assetGeneration.userId, locals.user.id);
	} else if (locals.guestSession) {
		ownershipCondition = eq(
			table.assetGeneration.guestSessionId,
			locals.guestSession.id,
		);
	} else {
		error(401, 'Unauthorized');
	}

	let asset = await db.query.assetGeneration.findFirst({
		where: and(eq(table.assetGeneration.id, params.id), ownershipCondition),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	/**
	 * Re-read the row after a write, so the response describes the row as it now
	 * stands rather than the copy this request read before the fal.ai round trip.
	 * Every write below is guarded and may legitimately match nothing — another
	 * poll, the cancel endpoint or the webhook may have settled the job while this
	 * request was in flight — and in that case the truthful answer is the row they
	 * left behind.
	 */
	const reload = async () => {
		const fresh = await db.query.assetGeneration.findFirst({
			where: eq(table.assetGeneration.id, params.id),
		});
		if (!fresh) error(404, 'Asset not found');
		return fresh;
	};

	// Check fal.ai status if we have a request ID and need to sync state
	const needsFalCheck =
		asset.runpodJobId &&
		(asset.status === 'pending' ||
			asset.status === 'processing' ||
			(asset.status === 'completed' && !asset.resultUrls?.processed));

	if (needsFalCheck) {
		try {
			const falStatus = await getSpriteJobStatus(asset.runpodJobId as string);

			if (
				falStatus.status === 'IN_PROGRESS' ||
				falStatus.status === 'IN_QUEUE'
			) {
				if (asset.status !== 'processing') {
					// The status read above only skips a redundant write; it cannot
					// gate this one. Without the guard, a poll that started before a
					// cancel would drag the already-refunded row back to 'processing',
					// which re-arms the claim below for the next poll to win — a second
					// refund for one job.
					await db
						.update(table.assetGeneration)
						.set({
							status: 'processing',
							currentStage:
								falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(
							and(
								eq(table.assetGeneration.id, asset.id),
								notInArray(table.assetGeneration.status, [
									'completed',
									'failed',
								]),
							),
						);

					asset = await reload();
				}
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				// One statement flips the row to 'failed' and credits its cost back,
				// so the refund hangs off the state transition instead of off the
				// `asset` copy read before the fal.ai round trip. Five concurrent
				// polls refunded five times off that copy; here four of them match
				// nothing and are credited nothing.
				//
				// A null claim means the job was already terminal — the cancel
				// endpoint or the fal webhook has failed-and-refunded it, or it
				// completed and the user is holding the result. Either way somebody
				// else has settled the money: do not credit, and do not treat it as an
				// error. Guest-owned rows have user_id NULL and hold no balance, so
				// the claim succeeds and credits nothing, which is correct.
				const claim = await claimJobAndRefund({
					job: table.assetGeneration,
					jobId: asset.id,
					errorMessage: falStatus.error || 'Job failed on fal.ai',
					claimableWhen: NOT_TERMINAL,
				});

				if (!claim) {
					console.log(
						`[assets-status] ${asset.id} was already terminal — no refund`,
					);
				}

				asset = await reload();
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
						.where(
							and(
								eq(table.assetGeneration.id, asset.id),
								// A failed row has already been refunded, so handing the
								// asset over now would give away a generation the user was
								// paid back for.
								ne(table.assetGeneration.status, 'failed'),
								// Re-stating the "no result yet" test as part of the WHERE
								// keeps the repair of a completed-but-empty row (which is what
								// `needsFalCheck` re-checks those rows for) while stopping this
								// from rewriting the URLs and completedAt of a result the
								// webhook stored while this request was in flight. Empty string
								// counts as absent, matching both the JS test above and the
								// spelling the cancel endpoint uses.
								sql`coalesce(result_urls ->> 'processed', '') = ''`,
							),
						);

					asset = await reload();
				}
			}
		} catch (e) {
			console.error('Failed to check fal.ai status:', e);
		}
	}

	// Return full asset so UI can update properly
	return json(asset);
};
