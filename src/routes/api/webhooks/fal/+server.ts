import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitRestyleGeneration } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import type { RequestHandler } from './$types';

interface FalWebhookPayload {
	request_id: string;
	status: 'OK' | 'ERROR';
	payload?: unknown;
	error?: string;
}

export const POST: RequestHandler = async ({ url, request }) => {
	const secret = url.searchParams.get('secret');
	if (!secret || secret !== env.FAL_WEBHOOK_SECRET) {
		error(401, 'Invalid webhook secret');
	}

	const type = url.searchParams.get('type');
	const jobId = url.searchParams.get('jobId');
	if (!type || !jobId) {
		error(400, 'Missing type or jobId');
	}

	const body = (await request.json()) as FalWebhookPayload;
	console.log(
		`[fal-webhook] type=${type} jobId=${jobId} status=${body.status} request_id=${body.request_id}`,
	);

	try {
		switch (type) {
			case 'sprite':
				await handleSprite(jobId, body);
				break;
			case 'rotation4':
				await handleRotation4(jobId, body);
				break;
			case 'rotation8':
				await handleRotation8(jobId, body);
				break;
			case 'rotation-single':
				await handleRotationSingle(jobId, body, url);
				break;
			case 'spin':
				await handleSpin(jobId, body);
				break;
			case 'conceptart':
				await handleConceptArt(jobId, body);
				break;
			case 'preprocessor':
				await handlePreprocessor(jobId, body, url);
				break;
			case 'restyle':
				await handleRestyle(jobId, body);
				break;
			case 'animate':
				await handleAnimate(jobId, body, url);
				break;
			default:
				console.error(`[fal-webhook] Unknown type: ${type}`);
				error(400, `Unknown webhook type: ${type}`);
		}
	} catch (err) {
		console.error(`[fal-webhook] Error handling ${type}/${jobId}:`, err);
		throw err;
	}

	return json({ ok: true });
};

// ============================================================================
// Sprite
// ============================================================================

async function handleSprite(jobId: string, body: FalWebhookPayload) {
	if (body.status === 'ERROR' || !body.payload) {
		await refundAndFailAsset(jobId, body.error || 'Sprite generation failed');
		return;
	}

	const data = body.payload as {
		processed?: { url: string };
		image?: { url: string };
		raw?: { url: string };
		seed?: number;
	};
	const processedUrl = data?.processed?.url || data?.image?.url;
	const rawUrl = data?.raw?.url;

	if (!processedUrl) {
		await refundAndFailAsset(jobId, 'No image in result');
		return;
	}

	await db
		.update(table.assetGeneration)
		.set({
			status: 'completed',
			progress: 100,
			currentStage: 'Completed',
			resultUrls: {
				raw: rawUrl || undefined,
				processed: processedUrl,
			},
			seed: data?.seed ?? null,
			completedAt: new Date(),
		})
		.where(eq(table.assetGeneration.id, jobId));
}

async function refundAndFailAsset(jobId: string, errorMessage: string) {
	const asset = await db.query.assetGeneration.findFirst({
		where: eq(table.assetGeneration.id, jobId),
	});
	if (!asset) return;

	if (asset.userId && asset.status !== 'failed') {
		const regularTokens = asset.tokenCost - asset.bonusTokenCost;
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${regularTokens}`,
				bonusTokens: sql`${table.user.bonusTokens} + ${asset.bonusTokenCost}`,
			})
			.where(eq(table.user.id, asset.userId));
	}

	await db
		.update(table.assetGeneration)
		.set({ status: 'failed', errorMessage })
		.where(eq(table.assetGeneration.id, jobId));
}

// ============================================================================
// Rotation (4-direction)
// ============================================================================

async function handleRotation4(jobId: string, body: FalWebhookPayload) {
	if (body.status === 'ERROR' || !body.payload) {
		await refundAndFailRotation4(jobId, body.error || 'Rotation failed');
		return;
	}

	const data = body.payload as {
		front?: { url: string };
		right?: { url: string };
		back?: { url: string };
		left?: { url: string };
	};

	await db
		.update(table.rotationJobNew)
		.set({
			status: 'completed',
			progress: 100,
			currentStage: 'Completed',
			rotationFront: data?.front?.url || null,
			rotationRight: data?.right?.url || null,
			rotationBack: data?.back?.url || null,
			rotationLeft: data?.left?.url || null,
			completedAt: new Date(),
		})
		.where(eq(table.rotationJobNew.id, jobId));
}

async function refundAndFailRotation4(jobId: string, errorMessage: string) {
	const job = await db.query.rotationJobNew.findFirst({
		where: eq(table.rotationJobNew.id, jobId),
	});
	if (!job) return;

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
		.update(table.rotationJobNew)
		.set({ status: 'failed', errorMessage })
		.where(eq(table.rotationJobNew.id, jobId));
}

// ============================================================================
// Rotation (8-direction)
// ============================================================================

async function handleRotation8(jobId: string, body: FalWebhookPayload) {
	if (body.status === 'ERROR' || !body.payload) {
		await refundAndFailRotation8(jobId, body.error || 'Rotation failed');
		return;
	}

	const data = body.payload as {
		image?: { url: string };
		image_2?: { url: string };
		image_3?: { url: string };
		image_4?: { url: string };
		image_5?: { url: string };
		image_6?: { url: string };
		image_7?: { url: string };
		image_8?: { url: string };
	};

	await db
		.update(table.rotationJob)
		.set({
			status: 'completed',
			progress: 100,
			currentStage: 'Completed',
			rotationS: data?.image?.url || null,
			rotationSW: data?.image_2?.url || null,
			rotationW: data?.image_3?.url || null,
			rotationNW: data?.image_4?.url || null,
			rotationN: data?.image_5?.url || null,
			rotationNE: data?.image_6?.url || null,
			rotationE: data?.image_7?.url || null,
			rotationSE: data?.image_8?.url || null,
			completedAt: new Date(),
		})
		.where(eq(table.rotationJob.id, jobId));
}

async function refundAndFailRotation8(jobId: string, errorMessage: string) {
	const job = await db.query.rotationJob.findFirst({
		where: eq(table.rotationJob.id, jobId),
	});
	if (!job) return;

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
		.update(table.rotationJob)
		.set({ status: 'failed', errorMessage })
		.where(eq(table.rotationJob.id, jobId));
}

// ============================================================================
// Rotation (single view regenerate)
// ============================================================================

async function handleRotationSingle(
	_jobId: string,
	_body: FalWebhookPayload,
	url: URL,
) {
	const direction = url.searchParams.get('direction');
	// Single view regeneration updates individual direction columns on existing jobs.
	// This is complex and the status endpoint already handles it via polling.
	console.log(
		`[fal-webhook] rotation-single for ${_jobId} direction=${direction} — skipping (polling handles this)`,
	);
}

// ============================================================================
// Spin
// ============================================================================

async function handleSpin(jobId: string, body: FalWebhookPayload) {
	// Spin requires local video processing (ffmpeg) after fal.ai completes.
	// The status endpoint handles the full pipeline including video creation.
	// Webhook just logs completion for observability.
	if (body.status === 'ERROR') {
		await refundAndFailSpin(jobId, body.error || 'Spin generation failed');
		return;
	}
	console.log(
		`[fal-webhook] Spin ${jobId} completed on fal.ai, status endpoint will handle video creation`,
	);
}

async function refundAndFailSpin(jobId: string, errorMessage: string) {
	const job = await db.query.spinJob.findFirst({
		where: eq(table.spinJob.id, jobId),
	});
	if (!job) return;

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
		.set({ status: 'failed', errorMessage })
		.where(eq(table.spinJob.id, jobId));
}

// ============================================================================
// Concept Art (standard / img2img)
// ============================================================================

async function handleConceptArt(jobId: string, body: FalWebhookPayload) {
	if (body.status === 'ERROR' || !body.payload) {
		await refundAndFailConceptArt(jobId, body.error || 'Generation failed');
		return;
	}

	const data = body.payload as {
		images?: Array<{ url: string }>;
		seed?: number;
	};
	const imageUrl = data?.images?.[0]?.url;

	if (!imageUrl) {
		await refundAndFailConceptArt(jobId, 'No image in result');
		return;
	}

	await db
		.update(table.conceptArtGeneration)
		.set({
			status: 'completed',
			progress: 100,
			currentStage: 'Completed',
			imageUrl,
			seed:
				data?.seed && data.seed <= Number.MAX_SAFE_INTEGER ? data.seed : null,
			completedAt: new Date(),
		})
		.where(eq(table.conceptArtGeneration.id, jobId));
}

// ============================================================================
// Preprocessor (restyle step 1)
// ============================================================================

async function handlePreprocessor(
	jobId: string,
	body: FalWebhookPayload,
	_url: URL,
) {
	if (body.status === 'ERROR' || !body.payload) {
		await refundAndFailConceptArt(jobId, body.error || 'Preprocessing failed');
		return;
	}

	const data = body.payload as { image?: { url: string } };
	const controlImageUrl = data?.image?.url;

	if (!controlImageUrl) {
		await refundAndFailConceptArt(
			jobId,
			'No control image in preprocessor result',
		);
		return;
	}

	// Get the job to retrieve generation params for step 2
	const job = await db.query.conceptArtGeneration.findFirst({
		where: eq(table.conceptArtGeneration.id, jobId),
	});

	if (!job) return;

	// Save control image and submit restyle generation (step 2)
	const controlMethod = (job.controlMethod as 'canny' | 'depth') || 'canny';

	const result = await submitRestyleGeneration({
		prompt: job.prompt,
		imageSize: job.imageSize || 'landscape_16_9',
		controlImageUrl,
		controlMethod,
		controlStrength: (job.controlStrength ?? 70) / 100,
		seed: job.seed ?? undefined,
		webhookUrl: buildFalWebhookUrl('restyle', jobId),
	});

	await db
		.update(table.conceptArtGeneration)
		.set({
			controlImageUrl,
			falRequestId: result.requestId,
			currentStage: 'Generating with style control...',
			progress: 50,
		})
		.where(eq(table.conceptArtGeneration.id, jobId));
}

// ============================================================================
// Restyle (restyle step 2)
// ============================================================================

async function handleRestyle(jobId: string, body: FalWebhookPayload) {
	// Same result format as concept art
	await handleConceptArt(jobId, body);
}

async function refundAndFailConceptArt(jobId: string, errorMessage: string) {
	const job = await db.query.conceptArtGeneration.findFirst({
		where: eq(table.conceptArtGeneration.id, jobId),
	});
	if (!job) return;

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
		.update(table.conceptArtGeneration)
		.set({ status: 'failed', errorMessage })
		.where(eq(table.conceptArtGeneration.id, jobId));
}

// ============================================================================
// Animation (per-direction video)
// ============================================================================

async function handleAnimate(jobId: string, body: FalWebhookPayload, url: URL) {
	const direction = url.searchParams.get('direction');
	if (!direction) {
		console.error(
			`[fal-webhook] animate webhook missing direction for job ${jobId}`,
		);
		return;
	}

	const job = await db.query.animationJob.findFirst({
		where: eq(table.animationJob.id, jobId),
	});
	if (!job) return;

	const requestIds = (job.falRequestIds as Record<string, string>) || {};
	const directionVideos = (job.directionVideos as Record<string, string>) || {};
	const directions = Object.keys(requestIds);

	if (body.status === 'ERROR' || !body.payload) {
		// One direction failed — fail the whole job
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
				errorMessage:
					body.error || `Animation failed for direction: ${direction}`,
				directionVideos,
			})
			.where(eq(table.animationJob.id, jobId));
		return;
	}

	const data = body.payload as { video?: { url: string } };
	const videoUrl = data?.video?.url;
	if (!videoUrl) {
		console.error(
			`[fal-webhook] animate webhook missing video URL for direction ${direction}, job ${jobId}`,
		);
		return;
	}

	// Atomic jsonb merge to avoid race conditions when parallel webhooks arrive
	const videoEntry = JSON.stringify({ [direction]: videoUrl });
	await db
		.update(table.animationJob)
		.set({
			directionVideos: sql`COALESCE(${table.animationJob.directionVideos}, '{}'::jsonb) || ${videoEntry}::jsonb`,
		})
		.where(eq(table.animationJob.id, jobId));

	// Re-read job to get the updated directionVideos for progress calculation
	const updated = await db.query.animationJob.findFirst({
		where: eq(table.animationJob.id, jobId),
	});
	if (!updated) return;

	const updatedVideos =
		(updated.directionVideos as Record<string, string>) || {};
	const completedCount = Object.keys(updatedVideos).length;
	const allComplete =
		directions.length > 0 && directions.every((d) => updatedVideos[d]);
	const progress = Math.floor(5 + (completedCount / directions.length) * 55);

	await db
		.update(table.animationJob)
		.set({
			status: 'processing',
			currentStage: allComplete
				? 'All directions complete, preparing export...'
				: `Animating directions (${completedCount}/${directions.length})...`,
			progress,
		})
		.where(eq(table.animationJob.id, jobId));

	// Note: frame export (buildFrameArchive) is still triggered by the status endpoint
	// when it detects all directions are complete, since it requires heavy local processing.
}
