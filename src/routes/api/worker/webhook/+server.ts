/**
 * Webhook endpoint for RunPod worker callbacks.
 * Handles job completion, failure, and progress updates.
 */

import { createHmac, timingSafeEqual } from 'node:crypto';
import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

interface WebhookPayload {
	job_id: string;
	job_type: 'sprite' | 'texture' | 'rotation';
	status: 'processing' | 'completed' | 'failed';
	result?: SpriteResult | TextureResult | RotationResult;
	error?: string;
	progress?: number;
	current_stage?: string;
}

interface SpriteResult {
	raw_url: string;
	processed_url: string;
	seed: number;
}

interface TextureResult {
	basecolor_url: string;
	normal_url: string;
	roughness_url: string;
	metallic_url: string;
	seed: number;
}

interface RotationResult {
	rotation_n: string;
	rotation_ne: string;
	rotation_e: string;
	rotation_se: string;
	rotation_s: string;
	rotation_sw: string;
	rotation_w: string;
	rotation_nw: string;
}

/**
 * Verify HMAC signature from the webhook request.
 */
function verifySignature(payload: string, signature: string): boolean {
	const secret = env.RUNPOD_WEBHOOK_SECRET;
	if (!secret) {
		console.error('RUNPOD_WEBHOOK_SECRET not configured');
		return false;
	}

	const expectedSignature = createHmac('sha256', secret)
		.update(payload)
		.digest('hex');

	try {
		return timingSafeEqual(
			Buffer.from(signature),
			Buffer.from(expectedSignature),
		);
	} catch {
		return false;
	}
}

/**
 * Refund tokens to a user for a failed job.
 */
async function refundTokens(
	userId: string,
	tokenCost: number,
	bonusTokenCost: number,
): Promise<void> {
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${tokenCost - bonusTokenCost}`,
			bonusTokens: sql`${table.user.bonusTokens} + ${bonusTokenCost}`,
		})
		.where(eq(table.user.id, userId));
}

/**
 * Handle sprite job updates.
 */
async function handleSpriteUpdate(payload: WebhookPayload): Promise<void> {
	const {
		job_id,
		status,
		result,
		error: errorMsg,
		progress,
		current_stage,
	} = payload;

	if (status === 'processing') {
		await db
			.update(table.assetGeneration)
			.set({
				status: 'processing',
				progress: progress ?? 0,
				currentStage: current_stage ?? 'Processing...',
			})
			.where(eq(table.assetGeneration.id, job_id));
	} else if (status === 'completed' && result) {
		const spriteResult = result as SpriteResult;
		await db
			.update(table.assetGeneration)
			.set({
				status: 'completed',
				progress: 100,
				currentStage: 'Completed',
				resultUrls: {
					raw: spriteResult.raw_url,
					processed: spriteResult.processed_url,
				},
				seed: spriteResult.seed,
				completedAt: new Date(),
			})
			.where(eq(table.assetGeneration.id, job_id));
	} else if (status === 'failed') {
		// Get job info for refund
		const [job] = await db
			.select()
			.from(table.assetGeneration)
			.where(eq(table.assetGeneration.id, job_id))
			.limit(1);

		if (job) {
			await refundTokens(job.userId, job.tokenCost, job.bonusTokenCost);
		}

		await db
			.update(table.assetGeneration)
			.set({
				status: 'failed',
				errorMessage: errorMsg ?? 'Unknown error',
			})
			.where(eq(table.assetGeneration.id, job_id));
	}
}

/**
 * Handle texture job updates.
 */
async function handleTextureUpdate(payload: WebhookPayload): Promise<void> {
	const {
		job_id,
		status,
		result,
		error: errorMsg,
		progress,
		current_stage,
	} = payload;

	if (status === 'processing') {
		await db
			.update(table.textureGeneration)
			.set({
				status: 'processing',
				progress: progress ?? 0,
				currentStage: current_stage ?? 'Processing...',
			})
			.where(eq(table.textureGeneration.id, job_id));
	} else if (status === 'completed' && result) {
		const textureResult = result as TextureResult;
		await db
			.update(table.textureGeneration)
			.set({
				status: 'completed',
				progress: 100,
				currentStage: 'Completed',
				basecolorUrl: textureResult.basecolor_url,
				normalUrl: textureResult.normal_url,
				roughnessUrl: textureResult.roughness_url,
				metallicUrl: textureResult.metallic_url,
				seed: textureResult.seed,
				completedAt: new Date(),
			})
			.where(eq(table.textureGeneration.id, job_id));
	} else if (status === 'failed') {
		// Get job info for refund
		const [job] = await db
			.select()
			.from(table.textureGeneration)
			.where(eq(table.textureGeneration.id, job_id))
			.limit(1);

		if (job) {
			await refundTokens(job.userId, job.tokenCost, job.bonusTokenCost);
		}

		await db
			.update(table.textureGeneration)
			.set({
				status: 'failed',
				errorMessage: errorMsg ?? 'Unknown error',
			})
			.where(eq(table.textureGeneration.id, job_id));
	}
}

/**
 * Handle rotation job updates.
 */
async function handleRotationUpdate(payload: WebhookPayload): Promise<void> {
	const {
		job_id,
		status,
		result,
		error: errorMsg,
		progress,
		current_stage,
	} = payload;

	if (status === 'processing') {
		await db
			.update(table.rotationJob)
			.set({
				status: 'processing',
				progress: progress ?? 0,
				currentStage: current_stage ?? 'Processing...',
			})
			.where(eq(table.rotationJob.id, job_id));
	} else if (status === 'completed' && result) {
		const rotationResult = result as RotationResult;
		await db
			.update(table.rotationJob)
			.set({
				status: 'completed',
				progress: 100,
				currentStage: 'Completed',
				rotationN: rotationResult.rotation_n,
				rotationNE: rotationResult.rotation_ne,
				rotationE: rotationResult.rotation_e,
				rotationSE: rotationResult.rotation_se,
				rotationS: rotationResult.rotation_s,
				rotationSW: rotationResult.rotation_sw,
				rotationW: rotationResult.rotation_w,
				rotationNW: rotationResult.rotation_nw,
				completedAt: new Date(),
			})
			.where(eq(table.rotationJob.id, job_id));
	} else if (status === 'failed') {
		// Get job info for refund
		const [job] = await db
			.select()
			.from(table.rotationJob)
			.where(eq(table.rotationJob.id, job_id))
			.limit(1);

		if (job) {
			await refundTokens(job.userId, job.tokenCost, job.bonusTokenCost);
		}

		await db
			.update(table.rotationJob)
			.set({
				status: 'failed',
				errorMessage: errorMsg ?? 'Unknown error',
			})
			.where(eq(table.rotationJob.id, job_id));
	}
}

export const POST: RequestHandler = async ({ request }) => {
	// Get the raw body for signature verification
	const rawBody = await request.text();

	// Verify signature
	const signature = request.headers.get('X-Webhook-Signature');
	if (!signature || !verifySignature(rawBody, signature)) {
		console.error('Invalid webhook signature');
		error(401, 'Invalid signature');
	}

	// Parse payload
	let payload: WebhookPayload;
	try {
		payload = JSON.parse(rawBody);
	} catch {
		error(400, 'Invalid JSON payload');
	}

	const { job_type } = payload;

	try {
		switch (job_type) {
			case 'sprite':
				await handleSpriteUpdate(payload);
				break;
			case 'texture':
				await handleTextureUpdate(payload);
				break;
			case 'rotation':
				await handleRotationUpdate(payload);
				break;
			default:
				console.error(`Unknown job type: ${job_type}`);
				error(400, `Unknown job type: ${job_type}`);
		}

		return json({ success: true });
	} catch (err) {
		console.error('Webhook processing error:', err);
		error(500, 'Internal server error');
	}
};
