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

	let job = await db.query.rotationJob.findFirst({
		where: and(
			eq(table.rotationJob.id, params.id),
			eq(table.rotationJob.userId, locals.user.id),
		),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	// If job is processing and has a RunPod job ID, check RunPod status
	if (
		job.runpodJobId &&
		(job.status === 'pending' || job.status === 'processing')
	) {
		try {
			const runpodStatus = await getJobStatus(job.runpodJobId);

			// If RunPod says the job failed or was cancelled, update our DB
			if (runpodStatus.status === 'FAILED' || runpodStatus.status === 'CANCELLED') {
				// Refund tokens
				const regularTokens = job.tokenCost - job.bonusTokenCost;
				await db
					.update(table.user)
					.set({
						tokens: sql`${table.user.tokens} + ${regularTokens}`,
						bonusTokens: sql`${table.user.bonusTokens} + ${job.bonusTokenCost}`,
					})
					.where(eq(table.user.id, job.userId));

				// Mark as failed
				await db
					.update(table.rotationJob)
					.set({
						status: 'failed',
						errorMessage: runpodStatus.error || 'Job failed on worker',
					})
					.where(eq(table.rotationJob.id, job.id));

				// Refetch updated job
				job = (await db.query.rotationJob.findFirst({
					where: eq(table.rotationJob.id, params.id),
				}))!;
			}
		} catch (e) {
			// Ignore RunPod API errors, just return current DB state
			console.error('Failed to check RunPod status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: job.id,
		status: job.status,
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
