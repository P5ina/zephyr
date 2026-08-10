import { error, json } from '@sveltejs/kit';
import { and, eq, notInArray, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { env } from '$env/dynamic/private';
import { claimJobAndRefund } from '$lib/server/credits';
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

/**
 * `completed` and `failed` are both terminal: once a job reaches either, no
 * webhook may move it out again.
 *
 * fal.ai delivery is at-least-once and, for animation, one job fans out to N
 * requests that all POST back here, so every write below has to be safe to
 * receive twice. Guarding on `failed` alone is not enough:
 *
 *   - `failed` is what a cancel writes after refunding, so a success webhook
 *     that lands afterwards (fal.queue.cancel throws once a request is RUNNING,
 *     and the cancel endpoints swallow that) would hand over the asset the user
 *     was already paid back for.
 *   - `completed` is the mirror image. A duplicate ERROR delivery for a job
 *     that already finished would refund a delivered asset, and a duplicate OK
 *     delivery would rewrite `completedAt` and the result URLs of an asset the
 *     user already has. Nothing in this codebase writes `completed` without
 *     writing the result URLs in the same statement, so there is no
 *     completed-but-empty row a late webhook could usefully repair.
 *
 * Physical-column form, for the `claimableWhen` of `claimJobAndRefund`. The
 * completion writes below spell the same predicate with `notInArray` on their
 * own status column.
 */
const NOT_TERMINAL = sql`status NOT IN ('completed', 'failed')`;

/**
 * Fails a job and credits its cost back in a single statement, claiming the
 * `-> failed` transition as it goes.
 *
 * The refund hangs off the state transition rather than off a status read taken
 * beforehand, so N concurrent or retried webhooks for one job produce exactly
 * one refund: the losers match nothing and are credited nothing. A null claim
 * means the row was already terminal (or gone) and must not be touched.
 */
async function failAndRefund(
	job: PgTable,
	kind: string,
	jobId: string,
	errorMessage: string,
) {
	const claim = await claimJobAndRefund({
		job,
		jobId,
		errorMessage,
		claimableWhen: NOT_TERMINAL,
	});

	if (!claim) {
		console.log(
			`[fal-webhook] ${kind} ${jobId} was already terminal or missing — no refund`,
		);
	}

	return claim;
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
			// A genuine completion owns the whole row: leaving a stale reason behind
			// would produce a row that is completed and cancellation-flagged at once.
			errorMessage: null,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(table.assetGeneration.id, jobId),
				notInArray(table.assetGeneration.status, ['completed', 'failed']),
			),
		);
}

async function refundAndFailAsset(jobId: string, errorMessage: string) {
	await failAndRefund(table.assetGeneration, 'sprite', jobId, errorMessage);
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
			errorMessage: null,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(table.rotationJobNew.id, jobId),
				notInArray(table.rotationJobNew.status, ['completed', 'failed']),
			),
		);
}

async function refundAndFailRotation4(jobId: string, errorMessage: string) {
	await failAndRefund(table.rotationJobNew, 'rotation4', jobId, errorMessage);
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
			errorMessage: null,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(table.rotationJob.id, jobId),
				notInArray(table.rotationJob.status, ['completed', 'failed']),
			),
		);
}

async function refundAndFailRotation8(jobId: string, errorMessage: string) {
	await failAndRefund(table.rotationJob, 'rotation8', jobId, errorMessage);
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
	await failAndRefund(table.spinJob, 'spin', jobId, errorMessage);
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
			errorMessage: null,
			completedAt: new Date(),
		})
		.where(
			and(
				eq(table.conceptArtGeneration.id, jobId),
				notInArray(table.conceptArtGeneration.status, ['completed', 'failed']),
			),
		);
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

	// Step 1 finished for a job that is already terminal — cancelled, or failed
	// by the status endpoint. Submitting step 2 would buy a second fal.ai
	// generation for a result the guarded write below would refuse to store. The
	// read is advisory (the guard on the write is the actual invariant), but it
	// is enough to stop paying for work nobody can receive.
	if (job.status === 'completed' || job.status === 'failed') {
		console.log(
			`[fal-webhook] preprocessor ${jobId} is already ${job.status} — not submitting restyle`,
		);
		return;
	}

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
		.where(
			and(
				eq(table.conceptArtGeneration.id, jobId),
				notInArray(table.conceptArtGeneration.status, ['completed', 'failed']),
			),
		);
}

// ============================================================================
// Restyle (restyle step 2)
// ============================================================================

async function handleRestyle(jobId: string, body: FalWebhookPayload) {
	// Same result format as concept art
	await handleConceptArt(jobId, body);
}

async function refundAndFailConceptArt(jobId: string, errorMessage: string) {
	await failAndRefund(
		table.conceptArtGeneration,
		'conceptart',
		jobId,
		errorMessage,
	);
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
	const directions = Object.keys(requestIds);

	if (body.status === 'ERROR' || !body.payload) {
		// One direction failed — fail the whole job. The job was charged once, so
		// it refunds once, however many of its N direction webhooks report the
		// failure: only the webhook that wins the `-> failed` transition credits
		// anything. The old code refunded off a status read taken before the write
		// and so paid out N times for one job.
		//
		// Nothing writes `directionVideos` here any more. It used to be echoed back
		// from the copy read at the top of this handler, which clobbered any
		// per-direction video that landed in between.
		await failAndRefund(
			table.animationJob,
			'animate',
			jobId,
			body.error || `Animation failed for direction: ${direction}`,
		);
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

	// Atomic jsonb merge to avoid race conditions when parallel webhooks arrive.
	// Guarded on the job not being terminal, so a direction that finishes after
	// the user cancelled is dropped rather than accumulated, and `returning()`
	// reports whether the merge actually happened — no re-read, and no acting on
	// a row somebody else has since moved on.
	const videoEntry = JSON.stringify({ [direction]: videoUrl });
	const [updated] = await db
		.update(table.animationJob)
		.set({
			directionVideos: sql`COALESCE(${table.animationJob.directionVideos}, '{}'::jsonb) || ${videoEntry}::jsonb`,
		})
		.where(
			and(
				eq(table.animationJob.id, jobId),
				notInArray(table.animationJob.status, ['completed', 'failed']),
			),
		)
		.returning();

	if (!updated) {
		console.log(
			`[fal-webhook] animate ${jobId} is already terminal — dropping late ${direction} video`,
		);
		return;
	}

	const updatedVideos =
		(updated.directionVideos as Record<string, string>) || {};
	const completedCount = Object.keys(updatedVideos).length;
	const allComplete =
		directions.length > 0 && directions.every((d) => updatedVideos[d]);
	const progress = Math.floor(5 + (completedCount / directions.length) * 55);

	// Same guard again: this statement writes `status`, so without it a late
	// webhook would drag a cancelled or failed job back to 'processing' — which
	// also re-arms the refund for the next direction webhook to arrive.
	await db
		.update(table.animationJob)
		.set({
			status: 'processing',
			currentStage: allComplete
				? 'All directions complete, preparing export...'
				: `Animating directions (${completedCount}/${directions.length})...`,
			progress,
		})
		.where(
			and(
				eq(table.animationJob.id, jobId),
				notInArray(table.animationJob.status, ['completed', 'failed']),
			),
		);

	// Note: frame export (buildFrameArchive) is still triggered by the status endpoint
	// when it detects all directions are complete, since it requires heavy local processing.
}
