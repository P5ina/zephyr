import type { Config } from '@sveltejs/adapter-vercel';
import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { and, eq, or, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getSpinJobStatus } from '$lib/server/fal';
import { createSpinVideo } from '$lib/server/video';
import type { RequestHandler } from './$types';

// Video processing requires more memory
export const config: Config = {
	runtime: 'nodejs22.x',
	memory: 3009,
	maxDuration: 60,
};

export const GET: RequestHandler = async ({ params, locals }) => {
	// Build query conditions - allow access for owner (user or guest)
	const conditions = [eq(table.spinJob.id, params.id)];

	if (locals.user) {
		conditions.push(eq(table.spinJob.userId, locals.user.id));
	} else if (locals.guestSession) {
		conditions.push(eq(table.spinJob.guestSessionId, locals.guestSession.id));
	} else {
		error(401, 'Unauthorized');
	}

	let job = await db.query.spinJob.findFirst({
		where: and(
			eq(table.spinJob.id, params.id),
			or(
				locals.user ? eq(table.spinJob.userId, locals.user.id) : undefined,
				locals.guestSession
					? eq(table.spinJob.guestSessionId, locals.guestSession.id)
					: undefined,
			),
		),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	// Check fal.ai status if we have a request ID and job is not final
	const needsFalCheck =
		job.falRequestId &&
		(job.status === 'pending' || job.status === 'processing') &&
		!job.videoUrl;

	if (needsFalCheck) {
		try {
			const falStatus = await getSpinJobStatus(job.falRequestId as string);

			if (
				falStatus.status === 'IN_PROGRESS' ||
				falStatus.status === 'IN_QUEUE'
			) {
				// Calculate simulated progress based on time elapsed
				const elapsedMs = Date.now() - new Date(job.createdAt).getTime();
				const elapsedSec = elapsedMs / 1000;

				// Estimate ~60 seconds for fal.ai processing, map to 0-40% progress
				const falProgress = Math.min(40, Math.floor((elapsedSec / 60) * 40));

				const newStage =
					falStatus.status === 'IN_QUEUE'
						? 'Queued...'
						: 'Generating frames...';
				const newProgress =
					falStatus.status === 'IN_QUEUE' ? 5 : Math.max(10, falProgress);

				await db
					.update(table.spinJob)
					.set({
						status: 'processing',
						currentStage: newStage,
						progress: newProgress,
					})
					.where(eq(table.spinJob.id, job.id));

				const refreshedJob = await db.query.spinJob.findFirst({
					where: eq(table.spinJob.id, params.id),
				});
				if (!refreshedJob) error(404, 'Job not found');
				job = refreshedJob;
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				// Refund tokens if user job
				if (job.userId && job.status !== 'failed') {
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
					.update(table.spinJob)
					.set({
						status: 'failed',
						errorMessage: falStatus.error || 'Job failed on fal.ai',
					})
					.where(eq(table.spinJob.id, job.id));

				const failedJob = await db.query.spinJob.findFirst({
					where: eq(table.spinJob.id, params.id),
				});
				if (!failedJob) error(404, 'Job not found');
				job = failedJob;
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				// fal.ai completed - now create the video
				await db
					.update(table.spinJob)
					.set({
						status: 'processing',
						currentStage: 'Creating video...',
						progress: 50,
					})
					.where(eq(table.spinJob.id, job.id));

				try {
					// Determine if watermark should be added (guest users get watermark)
					const addWatermark = !job.userId;

					// Create video with ffmpeg
					const videoBuffer = await createSpinVideo({
						inputImageUrl: job.inputImageUrl as string,
						frames: falStatus.output.frames,
						addWatermark,
					});

					// Upload video to Vercel Blob
					if (!env.BLOB_READ_WRITE_TOKEN) {
						throw new Error('Blob storage not configured');
					}

					const videoBlob = await put(
						`spins/${job.userId || `guest-${job.guestSessionId}`}/video-${job.id}.mp4`,
						videoBuffer,
						{
							access: 'public',
							contentType: 'video/mp4',
							token: env.BLOB_READ_WRITE_TOKEN,
						},
					);

					// Update job with video URL
					await db
						.update(table.spinJob)
						.set({
							status: 'completed',
							progress: 100,
							currentStage: 'Completed',
							videoUrl: videoBlob.url,
							completedAt: new Date(),
						})
						.where(eq(table.spinJob.id, job.id));

					const completedJob = await db.query.spinJob.findFirst({
						where: eq(table.spinJob.id, params.id),
					});
					if (!completedJob) error(404, 'Job not found');
					job = completedJob;
				} catch (videoError) {
					console.error('Video creation failed:', videoError);

					// Refund tokens if user job
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

					await db
						.update(table.spinJob)
						.set({
							status: 'failed',
							errorMessage: 'Failed to create video',
						})
						.where(eq(table.spinJob.id, job.id));

					const errorJob = await db.query.spinJob.findFirst({
						where: eq(table.spinJob.id, params.id),
					});
					if (!errorJob) error(404, 'Job not found');
					job = errorJob;
				}
			}
		} catch (e) {
			console.error('Failed to check fal.ai status:', e);
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
		response.videoUrl = job.videoUrl;
		response.inputImageUrl = job.inputImageUrl;
	}

	if (job.status === 'failed') {
		response.error = job.errorMessage;
	}

	return json(response);
};
