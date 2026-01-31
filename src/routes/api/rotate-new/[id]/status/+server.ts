import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getRotationJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	let job = await db.query.rotationJobNew.findFirst({
		where: and(
			eq(table.rotationJobNew.id, params.id),
			eq(table.rotationJobNew.userId, locals.user.id),
		),
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
			const falStatus = await getRotationJobStatus(job.falRequestId!);

			if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
				if (job.status !== 'processing') {
					await db
						.update(table.rotationJobNew)
						.set({
							status: 'processing',
							currentStage: falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
						})
						.where(eq(table.rotationJobNew.id, job.id));

					job = (await db.query.rotationJobNew.findFirst({
						where: eq(table.rotationJobNew.id, params.id),
					}))!;
				}
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
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
					.update(table.rotationJobNew)
					.set({
						status: 'failed',
						errorMessage: falStatus.error || 'Job failed on fal.ai',
					})
					.where(eq(table.rotationJobNew.id, job.id));

				job = (await db.query.rotationJobNew.findFirst({
					where: eq(table.rotationJobNew.id, params.id),
				}))!;
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				if (falStatus.output.front && !job.rotationFront) {
					await db
						.update(table.rotationJobNew)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							rotationFront: falStatus.output.front || null,
							rotationRight: falStatus.output.right || null,
							rotationBack: falStatus.output.back || null,
							rotationLeft: falStatus.output.left || null,
							completedAt: new Date(),
						})
						.where(eq(table.rotationJobNew.id, job.id));

					job = (await db.query.rotationJobNew.findFirst({
						where: eq(table.rotationJobNew.id, params.id),
					}))!;
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
