import { error, json } from '@sveltejs/kit';
import { and, eq, ne, notInArray, type SQL } from 'drizzle-orm';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getRotation8DirJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	let ownershipCondition: SQL | undefined;
	if (locals.user) {
		ownershipCondition = eq(table.rotationJob.userId, locals.user.id);
	} else if (locals.guestSession) {
		ownershipCondition = eq(
			table.rotationJob.guestSessionId,
			locals.guestSession.id,
		);
	} else {
		error(401, 'Unauthorized');
	}

	let job = await db.query.rotationJob.findFirst({
		where: and(eq(table.rotationJob.id, params.id), ownershipCondition),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	// Check fal.ai status if we have a request ID and need to sync state
	const needsFalCheck =
		job.runpodJobId &&
		(job.status === 'pending' ||
			job.status === 'processing' ||
			(job.status === 'completed' && !job.rotationS));

	if (needsFalCheck) {
		try {
			const falStatus = await getRotation8DirJobStatus(
				job.runpodJobId as string,
			);

			if (
				falStatus.status === 'IN_PROGRESS' ||
				falStatus.status === 'IN_QUEUE'
			) {
				if (job.status !== 'processing') {
					// Guarded on the row still being unsettled. `job` was read before
					// the fal.ai round trip, so by now a cancel or the webhook may have
					// failed-and-refunded it; an unguarded write here would drag that
					// row back to 'processing' and re-arm the claim below, letting the
					// next poll refund a job that was already paid back.
					await db
						.update(table.rotationJob)
						.set({
							status: 'processing',
							currentStage:
								falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(
							and(
								eq(table.rotationJob.id, job.id),
								notInArray(table.rotationJob.status, ['completed', 'failed']),
							),
						);

					const refreshedJob = await db.query.rotationJob.findFirst({
						where: eq(table.rotationJob.id, params.id),
					});
					if (!refreshedJob) error(404, 'Job not found');
					job = refreshedJob;
				}
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				// One statement claims the `-> failed` transition and credits the cost
				// back, so N polls in flight for one job produce exactly one refund.
				// The old code gated the credit on `job.status`, a copy read before
				// the fal.ai round trip that every concurrent poll held identically,
				// then wrote 'failed' with no guard at all — five simultaneous GETs
				// refunded five times.
				//
				// A null claim means the row was already terminal: a cancel, the fal
				// webhook, or a poll that got here first already failed it and already
				// paid it back. That is the normal outcome of a race, not an error —
				// credit nothing and report the row as it now stands. Guest jobs carry
				// user_id NULL and the helper credits them nothing.
				await claimJobAndRefund({
					job: table.rotationJob,
					jobId: job.id,
					errorMessage: falStatus.error || 'Job failed on fal.ai',
					claimableWhen: NOT_TERMINAL,
				});

				const failedJob = await db.query.rotationJob.findFirst({
					where: eq(table.rotationJob.id, params.id),
				});
				if (!failedJob) error(404, 'Job not found');
				job = failedJob;
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				if (falStatus.output.s && !job.rotationS) {
					await db
						.update(table.rotationJob)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							rotationN: falStatus.output.n || null,
							rotationNE: falStatus.output.ne || null,
							rotationE: falStatus.output.e || null,
							rotationSE: falStatus.output.se || null,
							rotationS: falStatus.output.s || null,
							rotationSW: falStatus.output.sw || null,
							rotationW: falStatus.output.w || null,
							rotationNW: falStatus.output.nw || null,
							completedAt: new Date(),
						})
						// Not `NOT_TERMINAL`: a row that is 'completed' with no result
						// URLs is exactly what this branch exists to repair, so
						// 'completed' has to stay writable here. 'failed' does not — that
						// is the state a cancel or the claim above writes after refunding,
						// and handing over the asset afterwards would give the user both
						// the credits and the generation.
						.where(
							and(
								eq(table.rotationJob.id, job.id),
								ne(table.rotationJob.status, 'failed'),
							),
						);

					const completedJob = await db.query.rotationJob.findFirst({
						where: eq(table.rotationJob.id, params.id),
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
		runpodJobId: job.runpodJobId,
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
			n: job.rotationN,
			ne: job.rotationNE,
			e: job.rotationE,
			se: job.rotationSE,
			s: job.rotationS,
			sw: job.rotationSW,
			w: job.rotationW,
			nw: job.rotationNW,
		};
	}

	if (job.status === 'failed') {
		response.error = job.errorMessage;
	}

	return json(response);
};
