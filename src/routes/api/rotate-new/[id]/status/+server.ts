import { error, json } from '@sveltejs/kit';
import { and, eq, isNull, ne, notInArray, type SQL } from 'drizzle-orm';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getRotationJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	let ownershipCondition: SQL | undefined;
	if (locals.user) {
		ownershipCondition = eq(table.rotationJobNew.userId, locals.user.id);
	} else if (locals.guestSession) {
		ownershipCondition = eq(
			table.rotationJobNew.guestSessionId,
			locals.guestSession.id,
		);
	} else {
		error(401, 'Unauthorized');
	}

	let job = await db.query.rotationJobNew.findFirst({
		where: and(eq(table.rotationJobNew.id, params.id), ownershipCondition),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	// Check fal.ai status if we have a request ID and need to sync state
	const needsFalCheck =
		job.falRequestId &&
		(job.status === 'pending' ||
			job.status === 'processing' ||
			(job.status === 'completed' && !job.rotationFront));

	if (needsFalCheck) {
		try {
			const falStatus = await getRotationJobStatus(job.falRequestId as string);

			if (
				falStatus.status === 'IN_PROGRESS' ||
				falStatus.status === 'IN_QUEUE'
			) {
				if (job.status !== 'processing') {
					// Guarded, because this statement writes `status`. Unguarded it
					// drags a job the cancel endpoint or the webhook already
					// failed-and-refunded back to 'processing' — which re-arms the
					// claim below for the next poll that sees FAILED, and refunds a
					// second time. The `job.status` test above is a stale read and
					// cannot carry that weight on its own.
					await db
						.update(table.rotationJobNew)
						.set({
							status: 'processing',
							currentStage:
								falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(
							and(
								eq(table.rotationJobNew.id, job.id),
								notInArray(table.rotationJobNew.status, [
									'completed',
									'failed',
								]),
							),
						);

					const refreshedJob = await db.query.rotationJobNew.findFirst({
						where: eq(table.rotationJobNew.id, params.id),
					});
					if (!refreshedJob) error(404, 'Job not found');
					job = refreshedJob;
				}
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				// One statement flips the job to 'failed' and credits its cost back,
				// so the refund hangs off the state transition instead of off `job`,
				// which was read before the fal.ai round trip above. Every poll in a
				// page's loop holds that same stale copy, and the old code refunded
				// off it once per request; five concurrent GETs paid out five times.
				//
				// A null claim means the row was already terminal — the cancel
				// endpoint or the fal webhook has already failed-and-refunded it, or
				// it completed. Nothing was written and nothing was credited, and
				// that is the normal outcome of a poll racing a cancel, not an error.
				const claim = await claimJobAndRefund({
					job: table.rotationJobNew,
					jobId: job.id,
					errorMessage: falStatus.error || 'Job failed on fal.ai',
					claimableWhen: NOT_TERMINAL,
				});

				if (!claim) {
					console.log(
						`[rotate-new/status] ${job.id} was already terminal — no refund`,
					);
				}

				// Re-read whatever the row settled on. Usually that is the 'failed'
				// this handler just claimed; when the claim lost it is the terminal
				// state the winner wrote, and the response reports that instead of
				// asserting a failure this request did not perform.
				const settledJob = await db.query.rotationJobNew.findFirst({
					where: eq(table.rotationJobNew.id, params.id),
				});
				if (!settledJob) error(404, 'Job not found');
				job = settledJob;
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				if (falStatus.output.front && !job.rotationFront) {
					// Not the plain terminal guard the two writes above use: the third
					// arm of `needsFalCheck` exists precisely to backfill a row that is
					// 'completed' with no images, so excluding 'completed' outright
					// would disable the repair this branch is here to perform.
					//
					// `status <> 'failed'` stops a poll that raced a cancel from
					// handing over the asset the user was just refunded for, and
					// `rotation_front IS NULL` stops a duplicate delivery from
					// rewriting `completedAt` and the URLs of an asset already held.
					// Together they still let the empty-completed row be repaired.
					await db
						.update(table.rotationJobNew)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							rotationFront: falStatus.output.front || null,
							rotationRight: falStatus.output.left || null,
							rotationBack: falStatus.output.back || null,
							rotationLeft: falStatus.output.right || null,
							completedAt: new Date(),
						})
						.where(
							and(
								eq(table.rotationJobNew.id, job.id),
								ne(table.rotationJobNew.status, 'failed'),
								isNull(table.rotationJobNew.rotationFront),
							),
						);

					const completedJob = await db.query.rotationJobNew.findFirst({
						where: eq(table.rotationJobNew.id, params.id),
					});
					if (!completedJob) error(404, 'Job not found');
					job = completedJob;
				}
			}
		} catch (e) {
			console.error('Failed to check fal.ai status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: job.id,
		status: job.status,
		falRequestId: job.falRequestId,
	};

	if (job.status === 'pending') {
		response.statusMessage = job.currentStage || 'Queued for processing...';
		response.progress = 0;
	}

	if (job.status === 'processing') {
		response.progress = job.progress;
		response.statusMessage = job.currentStage || 'Processing...';
	}

	if (job.status === 'completed') {
		response.progress = 100;
		response.rotations = {
			front: job.rotationFront,
			right: job.rotationRight,
			back: job.rotationBack,
			left: job.rotationLeft,
		};
	}

	if (job.status === 'failed') {
		response.error = job.errorMessage;
	}

	return json(response);
};
