import type { Config } from '@sveltejs/adapter-vercel';
import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { and, eq, notInArray } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { AnimationType } from '$lib/animation-config';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getAnimateJobStatus } from '$lib/server/fal';
import { buildFrameArchive } from '$lib/server/spritesheet';
import type { RequestHandler } from './$types';

export const config: Config = {
	runtime: 'nodejs22.x',
	memory: 3009,
	maxDuration: 300,
};

/**
 * Drizzle spelling of `NOT_TERMINAL`, for the writes below that are not refunds.
 *
 * This handler polls: the browser fires a GET every couple of seconds, several
 * can be in flight at once, and each one holds a copy of the job row that it
 * read before awaiting a fal.ai round trip and — on the export path — up to five
 * minutes of local ffmpeg work. Meanwhile `/api/animate/[id]/cancel` and the fal
 * webhook settle the same row atomically.
 *
 * So every write here has to say "only if nobody has settled this job yet",
 * not just the refunds:
 *
 *   - an unguarded `status = 'processing'` drags a cancelled-and-refunded job
 *     back out of `failed`, which re-arms the refund claim for whichever poll
 *     next sees a failing direction — a second payout for one charge;
 *   - an unguarded `status = 'completed'` hands over the asset the user was
 *     just paid back for, and buries the refund behind a completed row.
 */
const NOT_TERMINAL_STATUS = notInArray(table.animationJob.status, [
	'completed',
	'failed',
]);

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	let job = await db.query.animationJob.findFirst({
		where: eq(table.animationJob.id, params.id),
	});

	if (!job || job.userId !== locals.user.id) {
		error(404, 'Job not found');
	}

	let isExporting = job.currentStage?.startsWith('!exporting');

	// If export has been stuck for over 3 minutes (Vercel function likely timed out), allow retry
	if (isExporting && job.status === 'processing' && !job.spritesheetUrl) {
		const exportStartMatch = job.currentStage?.match(/!exporting@(\d+):/);
		const exportStartedAt = exportStartMatch
			? parseInt(exportStartMatch[1], 10)
			: 0;
		const staleMs = 3 * 60 * 1000;

		if (!exportStartedAt || Date.now() - exportStartedAt > staleMs) {
			await db
				.update(table.animationJob)
				.set({ currentStage: 'Retrying export...' })
				.where(and(eq(table.animationJob.id, job.id), NOT_TERMINAL_STATUS));
			const refreshedJob = await db.query.animationJob.findFirst({
				where: eq(table.animationJob.id, params.id),
			});
			if (!refreshedJob) error(404, 'Job not found');
			job = refreshedJob;
			isExporting = false;
		}
	}

	if (
		job.falRequestIds &&
		(job.status === 'pending' || job.status === 'processing') &&
		!job.spritesheetUrl &&
		!isExporting
	) {
		try {
			const requestIds = (job.falRequestIds as Record<string, string>) || {};
			const directionVideos =
				(job.directionVideos as Record<string, string>) || {};
			const directions = Object.keys(requestIds);

			const incompleteDirections = directions.filter(
				(direction) => !directionVideos[direction],
			);

			if (incompleteDirections.length > 0) {
				const statusResults = await Promise.all(
					incompleteDirections.map(async (direction) => ({
						direction,
						status: await getAnimateJobStatus(requestIds[direction]),
					})),
				);

				let anyFailed = false;
				let failError = '';

				for (const { direction, status } of statusResults) {
					if (status.status === 'COMPLETED' && status.output?.videoUrl) {
						directionVideos[direction] = status.output.videoUrl;
					} else if (
						status.status === 'FAILED' ||
						status.status === 'CANCELLED'
					) {
						anyFailed = true;
						failError =
							status.error || `Animation failed for direction: ${direction}`;
						break;
					}
				}

				if (anyFailed) {
					await failJob(job.id, failError);
					const failedJob = await db.query.animationJob.findFirst({
						where: eq(table.animationJob.id, params.id),
					});
					if (!failedJob) error(404, 'Job not found');
					job = failedJob;
				} else {
					const completedCount = Object.keys(directionVideos).length;
					const progress = Math.floor(
						5 + (completedCount / directions.length) * 55,
					);

					await db
						.update(table.animationJob)
						.set({
							status: 'processing',
							currentStage: `Animating directions (${completedCount}/${directions.length})...`,
							progress,
							directionVideos,
						})
						.where(and(eq(table.animationJob.id, job.id), NOT_TERMINAL_STATUS));

					const updatedJob = await db.query.animationJob.findFirst({
						where: eq(table.animationJob.id, params.id),
					});
					if (!updatedJob) error(404, 'Job not found');
					job = updatedJob;
				}
			}

			const allComplete =
				directions.length > 0 &&
				directions.every((direction) => directionVideos[direction]);

			if (allComplete && !job.spritesheetUrl) {
				const exportStartTime = Date.now();
				// Guarded so a job the user cancelled while this poll was talking to
				// fal.ai is never entered: `claimed` comes back empty and the whole
				// export — up to five minutes of ffmpeg, then a blob upload, then the
				// `completed` write — is skipped for a job that has already settled.
				const [claimed] = await db
					.update(table.animationJob)
					.set({
						currentStage: `!exporting@${Date.now()}:Extracting frames...`,
						progress: 65,
					})
					.where(and(eq(table.animationJob.id, job.id), NOT_TERMINAL_STATUS))
					.returning({ id: table.animationJob.id });

				if (claimed) {
					const jobId = job.id;
					try {
						const result = await buildFrameArchive(
							directionVideos,
							job.directionCount as 4 | 8,
							job.animationType as AnimationType,
							async (stage, progress) => {
								await db
									.update(table.animationJob)
									.set({
										currentStage: `!exporting@${exportStartTime}:${stage}`,
										progress,
									})
									.where(
										and(eq(table.animationJob.id, jobId), NOT_TERMINAL_STATUS),
									);
							},
						);

						if (!env.BLOB_READ_WRITE_TOKEN) {
							throw new Error('Blob storage not configured');
						}

						const blob = await put(
							`animates/${job.userId}/frames-${job.id}.zip`,
							result.buffer,
							{
								access: 'public',
								contentType: 'application/zip',
								token: env.BLOB_READ_WRITE_TOKEN,
								addRandomSuffix: true,
							},
						);

						// The archive took minutes to build; the user may have cancelled
						// and been refunded in the meantime. Without this guard the
						// completion would resurrect that job and deliver the asset on
						// top of the refund.
						await db
							.update(table.animationJob)
							.set({
								status: 'completed',
								progress: 100,
								currentStage: 'Completed',
								spritesheetUrl: blob.url,
								frameCount: result.frameCount,
								tileWidth: result.tileWidth,
								tileHeight: result.tileHeight,
								completedAt: new Date(),
							})
							.where(
								and(eq(table.animationJob.id, job.id), NOT_TERMINAL_STATUS),
							);

						const completedJob = await db.query.animationJob.findFirst({
							where: eq(table.animationJob.id, params.id),
						});
						if (!completedJob) error(404, 'Job not found');
						job = completedJob;
					} catch (archiveError) {
						console.error('Frame archive creation failed:', archiveError);

						// This block used to credit the balance unconditionally — no
						// status check at all — around tens of seconds of local work, so
						// two pollers that both entered the export and both threw paid
						// out twice, and a job the user had already cancelled and been
						// refunded for paid out again. The claim below is the whole
						// decision: it flips `-> failed` and credits in one statement, and
						// a null result means somebody else already settled this job, so
						// there is nothing to credit and nothing to report as an error.
						await failJob(jobId, 'Failed to build frame archive');

						const errorJob = await db.query.animationJob.findFirst({
							where: eq(table.animationJob.id, params.id),
						});
						if (!errorJob) error(404, 'Job not found');
						job = errorJob;
					}
				}
			}
		} catch (e) {
			console.error('Failed to check animation status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: job.id,
		status: job.status,
	};

	if (job.status === 'pending') {
		response.statusMessage = normalizeStage(
			job.currentStage || 'Queued for processing...',
		);
		response.progress = 0;
	}

	if (job.status === 'processing') {
		response.progress = job.progress;
		response.statusMessage = normalizeStage(
			job.currentStage || 'Processing...',
		);
	}

	if (job.status === 'completed') {
		response.progress = 100;
		response.spritesheetUrl = job.spritesheetUrl;
		response.frameCount = job.frameCount;
		response.tileWidth = job.tileWidth;
		response.tileHeight = job.tileHeight;
		response.directionVideos = job.directionVideos;
		response.inputImageUrl = job.inputImageUrl;
		response.directionInputImages = job.directionInputImages;
	}

	if (job.status === 'failed') {
		response.error = job.errorMessage;
	}

	return json(response);
};

function normalizeStage(stage: string): string {
	// Strip internal prefixes like "!exporting@1234567890:Actual stage..."
	const match = stage.match(/^![\w@]+:(.+)$/);
	if (match) return match[1];
	return stage;
}

/**
 * Fails the job and credits its cost back, in one statement.
 *
 * The refund used to hang off `job.status !== 'failed'` read from the copy
 * fetched at the top of the handler — before the fal.ai round trip — and then
 * wrote `status = 'failed'` in a second, unguarded statement. Five concurrent
 * polls all passed that check against the same stale copy and all paid out: a
 * 3-token job ended up refunding 15. Worse, a cancel racing the poll loop
 * settled the job atomically and this handler paid a second time on top.
 *
 * Now the `-> failed` transition IS the refund: `claimJobAndRefund` claims it
 * with `NOT_TERMINAL` as the WHERE of the write, so exactly one caller can win.
 * A null claim means another path (a cancel, a fal webhook, another poll) has
 * already failed-and-refunded this job — not an error, just nothing to do. The
 * caller re-reads the row and reports whatever the winner wrote.
 *
 * `directionVideos` is deliberately not written here. It used to be echoed back
 * from the pre-fetched copy, clobbering any per-direction video the webhook
 * landed in between; on a job that is failing and being refunded it buys
 * nothing, and the webhook merges each video atomically as it arrives.
 */
async function failJob(jobId: string, errorMessage: string) {
	const claim = await claimJobAndRefund({
		job: table.animationJob,
		jobId,
		errorMessage,
		claimableWhen: NOT_TERMINAL,
	});

	if (!claim) {
		console.log(
			`[animate-status] job ${jobId} was already terminal — no refund`,
		);
	}

	return claim;
}
