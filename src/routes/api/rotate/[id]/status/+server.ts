import { error, json } from '@sveltejs/kit';
import { and, eq, type SQL, sql } from 'drizzle-orm';
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
					await db
						.update(table.rotationJob)
						.set({
							status: 'processing',
							currentStage:
								falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(eq(table.rotationJob.id, job.id));

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
				if (job.status !== 'failed') {
					// Only refund tokens for authenticated users
					if (job.userId) {
						const regularTokens = job.tokenCost - job.bonusTokenCost;
						await db
							.update(table.user)
							.set({
								tokens: sql`${table.user.tokens} + ${regularTokens}`,
								bonusTokens: sql`${table.user.bonusTokens} + ${job.bonusTokenCost}`,
							})
							.where(eq(table.user.id, job.userId));
					}
				}

				await db
					.update(table.rotationJob)
					.set({
						status: 'failed',
						errorMessage: falStatus.error || 'Job failed on fal.ai',
					})
					.where(eq(table.rotationJob.id, job.id));

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
						.where(eq(table.rotationJob.id, job.id));

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
