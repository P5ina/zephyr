import type { Config } from '@sveltejs/adapter-vercel';
import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import type { AnimationType } from '$lib/animation-config';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { buildFrameArchive } from '$lib/server/spritesheet';
import { getAnimateJobStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const config: Config = {
	runtime: 'nodejs22.x',
	memory: 3009,
	maxDuration: 300,
};

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
		const exportStartedAt = exportStartMatch ? parseInt(exportStartMatch[1]) : 0;
		const staleMs = 3 * 60 * 1000;

		if (!exportStartedAt || Date.now() - exportStartedAt > staleMs) {
			await db
				.update(table.animationJob)
				.set({ currentStage: 'Retrying export...' })
				.where(eq(table.animationJob.id, job.id));
			job = (await db.query.animationJob.findFirst({
				where: eq(table.animationJob.id, params.id),
			}))!;
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
			const directionVideos = (job.directionVideos as Record<string, string>) || {};
			const directions = Object.keys(requestIds);

			const incompleteDirections = directions.filter((direction) => !directionVideos[direction]);

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
					} else if (status.status === 'FAILED' || status.status === 'CANCELLED') {
						anyFailed = true;
						failError = status.error || `Animation failed for direction: ${direction}`;
						break;
					}
				}

				if (anyFailed) {
					await failJob(job, failError, directionVideos);
					job = (await db.query.animationJob.findFirst({
						where: eq(table.animationJob.id, params.id),
					}))!;
				} else {
					const completedCount = Object.keys(directionVideos).length;
					const progress = Math.floor(5 + (completedCount / directions.length) * 55);

					await db
						.update(table.animationJob)
						.set({
							status: 'processing',
							currentStage: `Animating directions (${completedCount}/${directions.length})...`,
							progress,
							directionVideos,
						})
						.where(eq(table.animationJob.id, job.id));

					job = (await db.query.animationJob.findFirst({
						where: eq(table.animationJob.id, params.id),
					}))!;
				}
			}

			const allComplete = directions.length > 0 && directions.every((direction) => directionVideos[direction]);

			if (allComplete && !job.spritesheetUrl) {
				const exportStartTime = Date.now();
				const [claimed] = await db
					.update(table.animationJob)
					.set({
						currentStage: `!exporting@${Date.now()}:Extracting frames...`,
						progress: 65,
					})
					.where(eq(table.animationJob.id, job.id))
					.returning({ id: table.animationJob.id });

				if (claimed) {
					try {
						const result = await buildFrameArchive(
							directionVideos,
							job.directionCount as 4 | 8,
							job.animationType as AnimationType,
							async (stage, progress) => {
								await db
									.update(table.animationJob)
									.set({ currentStage: `!exporting@${exportStartTime}:${stage}`, progress })
									.where(eq(table.animationJob.id, job!.id));
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
							.where(eq(table.animationJob.id, job.id));

						job = (await db.query.animationJob.findFirst({
							where: eq(table.animationJob.id, params.id),
						}))!;
					} catch (archiveError) {
						console.error('Frame archive creation failed:', archiveError);

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
							.update(table.animationJob)
							.set({
								status: 'failed',
								errorMessage: 'Failed to build frame archive',
							})
							.where(eq(table.animationJob.id, job.id));

						job = (await db.query.animationJob.findFirst({
							where: eq(table.animationJob.id, params.id),
						}))!;
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
		response.statusMessage = normalizeStage(job.currentStage || 'Queued for processing...');
		response.progress = 0;
	}

	if (job.status === 'processing') {
		response.progress = job.progress;
		response.statusMessage = normalizeStage(job.currentStage || 'Processing...');
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

async function failJob(
	job: NonNullable<Awaited<ReturnType<typeof db.query.animationJob.findFirst>>>,
	errorMessage: string,
	directionVideos: Record<string, string>,
) {
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
		.update(table.animationJob)
		.set({
			status: 'failed',
			errorMessage,
			directionVideos,
		})
		.where(eq(table.animationJob.id, job.id));
}
