import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { put } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { generate, checkHealth } from '$lib/server/comfyui-client';
import type { RequestHandler } from './$types';

const TOKEN_COSTS: Record<string, number> = {
	sprite: 2,
	pixel_art: 2,
	texture: 3,
};

interface AssetGenerateRequest {
	assetType?: 'sprite' | 'pixel_art' | 'texture';
	prompt: string;
	negativePrompt?: string;
	width?: number;
	height?: number;
	seed?: number;
}

// Background generation - runs after response is sent
async function processGeneration(
	assetId: string,
	userId: string,
	params: {
		prompt: string;
		width: number;
		height: number;
		seed?: number;
	},
	tokenCost: number,
) {
	const logPrefix = `[Gen:${assetId.slice(0, 8)}]`;

	try {
		console.log(`${logPrefix} Starting generation: "${params.prompt.slice(0, 50)}..."`);

		const result = await generate({
			workflow: 'sprite',
			...params,
		});

		if (!result.success || !result.imageData) {
			const errorMsg = result.error || 'Unknown generation error';
			console.error(`${logPrefix} ComfyUI error: ${errorMsg}`);
			throw new Error(`ComfyUI: ${errorMsg}`);
		}

		console.log(`${logPrefix} Generation complete, uploading to blob...`);

		// Upload to Vercel Blob
		const filename = `assets/${assetId}.png`;
		let blob;
		try {
			blob = await put(filename, result.imageData, {
				access: 'public',
				contentType: 'image/png',
				token: BLOB_READ_WRITE_TOKEN,
			});
		} catch (uploadErr) {
			const uploadMsg = uploadErr instanceof Error ? uploadErr.message : 'Upload failed';
			console.error(`${logPrefix} Blob upload error: ${uploadMsg}`);
			throw new Error(`Upload: ${uploadMsg}`);
		}

		console.log(`${logPrefix} Upload complete: ${blob.url}`);

		// Update asset as completed
		await db
			.update(table.assetGeneration)
			.set({
				status: 'completed',
				resultUrls: { raw: blob.url },
				seed: result.seed,
				completedAt: new Date(),
			})
			.where(eq(table.assetGeneration.id, assetId));

		console.log(`${logPrefix} Done`);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error(`${logPrefix} Failed: ${message}`);

		// Mark as failed with detailed error
		await db
			.update(table.assetGeneration)
			.set({
				status: 'failed',
				errorMessage: message,
			})
			.where(eq(table.assetGeneration.id, assetId));

		// Refund tokens
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${tokenCost}`,
			})
			.where(eq(table.user.id, userId));

		console.log(`${logPrefix} Tokens refunded: ${tokenCost}`);
	}
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: AssetGenerateRequest = await request.json();

	if (!body.prompt?.trim()) {
		error(400, 'Prompt is required');
	}

	if (body.prompt.length > 2000) {
		error(400, 'Prompt must be 2000 characters or less');
	}

	const assetType = body.assetType || 'sprite';
	if (!TOKEN_COSTS[assetType]) {
		error(400, 'Invalid asset type');
	}

	const cost = TOKEN_COSTS[assetType];
	const total = locals.user.tokens + locals.user.bonusTokens;

	if (total < cost) {
		error(402, `Not enough tokens. Required: ${cost}, available: ${total}`);
	}

	// Check if ComfyUI is available
	const healthy = await checkHealth();
	if (!healthy) {
		error(503, 'Generation service is temporarily unavailable');
	}

	// Deduct tokens before generation
	const bonusDeduct = Math.min(locals.user.bonusTokens, cost);
	const regularDeduct = cost - bonusDeduct;

	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	// Create asset record immediately
	const assetId = nanoid();
	const assetVisibleId = nanoid(10);
	const width = body.width || 1024;
	const height = body.height || 1024;

	const [asset] = await db
		.insert(table.assetGeneration)
		.values({
			id: assetId,
			visibleId: assetVisibleId,
			userId: locals.user.id,
			assetType,
			prompt: body.prompt,
			negativePrompt: body.negativePrompt,
			width,
			height,
			status: 'processing',
			tokenCost: cost,
		})
		.returning();

	// Start generation in background (don't await)
	processGeneration(
		assetId,
		locals.user.id,
		{
			prompt: body.prompt,
			width,
			height,
			seed: body.seed,
		},
		cost,
	).catch(console.error);

	const tokensRemaining = locals.user.tokens - regularDeduct;
	const bonusRemaining = locals.user.bonusTokens - bonusDeduct;

	return json({
		asset,
		tokensUsed: cost,
		tokensRemaining,
		bonusTokensRemaining: bonusRemaining,
		totalTokensRemaining: tokensRemaining + bonusRemaining,
	});
};
