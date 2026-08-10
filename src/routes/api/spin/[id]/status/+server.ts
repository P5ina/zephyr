import type { Config } from '@sveltejs/adapter-vercel';
import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { and, eq, notInArray, or } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
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

	// Every write below is guarded on the job not already being terminal, so the
	// row this returns can differ from the one the write intended to produce —
	// that is the point. It reports what the job actually is now.
	const readJob = async () => {
		const fresh = await db.query.spinJob.findFirst({
			where: eq(table.spinJob.id, params.id),
		});
		if (!fresh) error(404, 'Job not found');
		return fresh;
	};

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

				// Guarded: without it a poll that started before a cancel landed would
				// drag the job back out of 'failed' into 'processing', which re-arms
				// the refund for the next poll to claim a second time.
				await db
					.update(table.spinJob)
					.set({
						status: 'processing',
						currentStage: newStage,
						progress: newProgress,
					})
					.where(
						and(
							eq(table.spinJob.id, job.id),
							notInArray(table.spinJob.status, ['completed', 'failed']),
						),
					);

				job = await readJob();
			} else if (
				falStatus.status === 'FAILED' ||
				falStatus.status === 'CANCELLED'
			) {
				// The refund hangs off the '-> failed' transition, not off `job`, which
				// is a copy read before the fal.ai round trip. Five concurrent polls
				// all held that copy and all passed a `status !== 'failed'` check, so
				// all five paid out; now only the poll that wins the transition credits
				// anything.
				//
				// A null claim means the job was already terminal — the cancel endpoint
				// or the fal webhook failed-and-refunded it, or another poll got here
				// first. Nothing was written and nothing was credited, and that is the
				// correct outcome, not an error: just report the row as it stands.
				await claimJobAndRefund({
					job: table.spinJob,
					jobId: job.id,
					errorMessage: falStatus.error || 'Job failed on fal.ai',
					claimableWhen: NOT_TERMINAL,
				});

				job = await readJob();
			} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
				// fal.ai completed - claim the job for video creation. The guard is what
				// stops a poll that overlapped a cancel from handing over a video the
				// user was already refunded for, and `returning()` says whether this
				// request won: if it did not, the job is terminal, there is nobody to
				// deliver to, and a minute of ffmpeg plus a blob upload is skipped.
				const [claimedForVideo] = await db
					.update(table.spinJob)
					.set({
						status: 'processing',
						currentStage: 'Creating video...',
						progress: 50,
					})
					.where(
						and(
							eq(table.spinJob.id, job.id),
							notInArray(table.spinJob.status, ['completed', 'failed']),
						),
					)
					.returning();

				if (!claimedForVideo) {
					job = await readJob();
				} else {
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

						// Update job with video URL. Guarded for the same reason as the
						// claim above: ffmpeg takes tens of seconds, and a cancel that
						// landed in the meantime already refunded this job.
						await db
							.update(table.spinJob)
							.set({
								status: 'completed',
								progress: 100,
								currentStage: 'Completed',
								videoUrl: videoBlob.url,
								completedAt: new Date(),
							})
							.where(
								and(
									eq(table.spinJob.id, job.id),
									notInArray(table.spinJob.status, ['completed', 'failed']),
								),
							);

						job = await readJob();
					} catch (videoError) {
						console.error('Video creation failed:', videoError);

						// This block used to credit the user unconditionally — no status
						// check at all, stale or otherwise — around tens of seconds of
						// local work, so every request that entered it paid out again.
						// The claim makes the refund a property of the '-> failed'
						// transition, so it happens once however many polls fail here,
						// and not at all if the cancel endpoint or the webhook already
						// settled the job. A null claim credited nothing and is not an
						// error condition.
						await claimJobAndRefund({
							job: table.spinJob,
							jobId: job.id,
							errorMessage: 'Failed to create video',
							claimableWhen: NOT_TERMINAL,
						});

						job = await readJob();
					}
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
