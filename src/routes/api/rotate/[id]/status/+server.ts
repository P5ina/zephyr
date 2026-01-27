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

	// Check RunPod status if we have a job ID and need to sync state
	const needsRunpodCheck =
		job.runpodJobId &&
		(job.status === 'pending' ||
			job.status === 'processing' ||
			(job.status === 'completed' && !job.rotationS));

	if (needsRunpodCheck) {
		try {
			const runpodStatus = await getJobStatus(job.runpodJobId!);

			if (runpodStatus.status === 'IN_PROGRESS') {
				if (job.status !== 'processing') {
					await db
						.update(table.rotationJob)
						.set({
							status: 'processing',
							currentStage: 'Processing...',
						})
						.where(eq(table.rotationJob.id, job.id));

					job = (await db.query.rotationJob.findFirst({
						where: eq(table.rotationJob.id, params.id),
					}))!;
				}
			} else if (runpodStatus.status === 'FAILED' || runpodStatus.status === 'CANCELLED') {
				if (job.status !== 'failed') {
					const regularTokens = job.tokenCost - job.bonusTokenCost;
					await db
						.update(table.user)
						.set({
							tokens: sql`${table.user.tokens} + ${regularTokens}`,
							bonusTokens: sql`${table.user.bonusTokens} + ${job.bonusTokenCost}`,
						})
						.where(eq(table.user.id, job.userId));
				}

				await db
					.update(table.rotationJob)
					.set({
						status: 'failed',
						errorMessage: runpodStatus.error || 'Job failed on worker',
					})
					.where(eq(table.rotationJob.id, job.id));

				job = (await db.query.rotationJob.findFirst({
					where: eq(table.rotationJob.id, params.id),
				}))!;
			} else if (runpodStatus.status === 'COMPLETED' && runpodStatus.output) {
				const output = runpodStatus.output as Record<string, unknown>;
				if (output.rotation_s && !job.rotationS) {
					await db
						.update(table.rotationJob)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							rotationN: (output.rotation_n as string) || null,
							rotationNE: (output.rotation_ne as string) || null,
							rotationE: (output.rotation_e as string) || null,
							rotationSE: (output.rotation_se as string) || null,
							rotationS: (output.rotation_s as string) || null,
							rotationSW: (output.rotation_sw as string) || null,
							rotationW: (output.rotation_w as string) || null,
							rotationNW: (output.rotation_nw as string) || null,
							completedAt: new Date(),
						})
						.where(eq(table.rotationJob.id, job.id));

					job = (await db.query.rotationJob.findFirst({
						where: eq(table.rotationJob.id, params.id),
					}))!;
				}
			}
		} catch (e) {
			console.error('Failed to check RunPod status:', e);
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
