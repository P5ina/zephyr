import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { put } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { checkHealth, generateRotations } from '$lib/server/comfyui-client';
import type { RequestHandler } from './$types';

const TOKEN_COST = 8;

interface RotationSettings {
	mode: 'regular' | 'pixel_art';
	prompt: string;
	seed?: number;
	pixelResolution?: number;
	colorCount?: number;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const prompt = body.prompt as string | undefined;
	const mode = (body.mode as string) || 'regular';
	const seed = body.seed as number | undefined;
	const pixelResolution = body.pixelResolution as number | undefined;
	const colorCount = body.colorCount as number | undefined;

	if (!prompt || prompt.trim().length === 0) {
		error(400, 'Prompt is required');
	}

	if (prompt.length > 500) {
		error(400, 'Prompt must be less than 500 characters');
	}

	const settings: RotationSettings = {
		mode: mode === 'pixel_art' ? 'pixel_art' : 'regular',
		prompt: prompt.trim(),
		seed,
		pixelResolution,
		colorCount,
	};

	const total = locals.user.tokens + locals.user.bonusTokens;
	if (total < TOKEN_COST) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`);
	}

	// Check if ComfyUI is available
	const healthy = await checkHealth();
	if (!healthy) {
		error(503, 'Generation service is temporarily unavailable');
	}

	// Deduct tokens
	const bonusDeduct = Math.min(locals.user.bonusTokens, TOKEN_COST);
	const regularDeduct = TOKEN_COST - bonusDeduct;

	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	// Create rotation job record
	const jobId = nanoid();

	const [job] = await db
		.insert(table.rotationJob)
		.values({
			id: jobId,
			userId: locals.user.id,
			status: 'processing',
			tokenCost: TOKEN_COST,
			prompt: settings.prompt,
			mode: settings.mode,
			pixelResolution: settings.pixelResolution,
			colorCount: settings.colorCount,
		})
		.returning();

	// Start generation in background
	processRotation(
		jobId,
		locals.user.id,
		settings,
		TOKEN_COST,
	).catch(console.error);

	return json({
		id: job.id,
		status: 'processing',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
};

async function processRotation(
	jobId: string,
	userId: string,
	settings: RotationSettings,
	tokenCost: number,
) {
	const logPrefix = `[Rotate:${jobId.slice(0, 8)}]`;

	try {
		console.log(`${logPrefix} Starting rotation generation (mode: ${settings.mode})`);
		console.log(`${logPrefix} Prompt: "${settings.prompt.substring(0, 50)}..."`);

		// Call ComfyUI with appropriate workflow
		const workflow = settings.mode === 'pixel_art' ? 'rotate_pixel' : 'rotate_regular';
		const result = await generateRotations({
			workflow,
			prompt: settings.prompt,
			seed: settings.seed,
			pixelResolution: settings.pixelResolution,
			colorCount: settings.colorCount,
		});

		if (!result.success || !result.images) {
			throw new Error(result.error || 'Rotation generation failed');
		}

		// Upload all generated images to blob storage
		const uploadedUrls: Record<string, string> = {};
		const directions = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

		for (const dir of directions) {
			const img = result.images[dir];
			if (img) {
				const blob = await put(`rotations/${jobId}_${dir}.png`, img, {
					access: 'public',
					contentType: 'image/png',
					token: BLOB_READ_WRITE_TOKEN,
				});
				uploadedUrls[dir] = blob.url;
			}
		}

		// Update job with results
		await db
			.update(table.rotationJob)
			.set({
				status: 'completed',
				rotationN: uploadedUrls.n,
				rotationNE: uploadedUrls.ne,
				rotationE: uploadedUrls.e,
				rotationSE: uploadedUrls.se,
				rotationS: uploadedUrls.s,
				rotationSW: uploadedUrls.sw,
				rotationW: uploadedUrls.w,
				rotationNW: uploadedUrls.nw,
				completedAt: new Date(),
			})
			.where(eq(table.rotationJob.id, jobId));

		console.log(`${logPrefix} Completed successfully`);
		return;

	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error(`${logPrefix} Failed: ${message}`);

		await db
			.update(table.rotationJob)
			.set({
				status: 'failed',
				errorMessage: message,
			})
			.where(eq(table.rotationJob.id, jobId));

		// Refund tokens
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${tokenCost}`,
			})
			.where(eq(table.user.id, userId));

		console.log(`${logPrefix} Tokens refunded`);
	}
}
