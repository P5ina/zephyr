import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { put } from '@vercel/blob';
import { BLOB_READ_WRITE_TOKEN } from '$env/static/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { checkHealth } from '$lib/server/comfyui-client';
import type { RequestHandler } from './$types';

const TOKEN_COST = 5;

interface TextureGenerateRequest {
	prompt: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: TextureGenerateRequest = await request.json();

	if (!body.prompt?.trim()) {
		error(400, 'Prompt is required');
	}

	if (body.prompt.length > 2000) {
		error(400, 'Prompt must be 2000 characters or less');
	}

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

	// Create texture generation record
	const textureId = nanoid();

	const [texture] = await db
		.insert(table.textureGeneration)
		.values({
			id: textureId,
			userId: locals.user.id,
			prompt: body.prompt.trim(),
			status: 'processing',
			tokenCost: TOKEN_COST,
		})
		.returning();

	// Start generation in background
	processTextureGeneration(
		textureId,
		locals.user.id,
		body.prompt.trim(),
		TOKEN_COST,
	).catch(console.error);

	return json({
		id: texture.id,
		status: 'processing',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
};

async function processTextureGeneration(
	textureId: string,
	userId: string,
	prompt: string,
	tokenCost: number,
) {
	const logPrefix = `[Texture:${textureId.slice(0, 8)}]`;

	try {
		console.log(`${logPrefix} Starting texture generation: "${prompt.slice(0, 50)}..."`);

		// TODO: Replace with actual ComfyUI workflow call
		// For now, generate placeholder textures using a simple approach
		// This will be replaced with: FLUX -> DeepBump -> ControlNet roughness/metallic

		// Simulate generation time
		await new Promise((r) => setTimeout(r, 3000));

		// For now, mark as completed with placeholder message
		// Real implementation will call ComfyUI workflow
		await db
			.update(table.textureGeneration)
			.set({
				status: 'failed',
				errorMessage: 'Texture generation workflow not yet configured. Training in progress.',
			})
			.where(eq(table.textureGeneration.id, textureId));

		// Refund tokens since we can't generate yet
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${tokenCost}`,
			})
			.where(eq(table.user.id, userId));

		console.log(`${logPrefix} Tokens refunded - workflow not ready`);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error(`${logPrefix} Failed: ${message}`);

		await db
			.update(table.textureGeneration)
			.set({
				status: 'failed',
				errorMessage: message,
			})
			.where(eq(table.textureGeneration.id, textureId));

		// Refund tokens
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${tokenCost}`,
			})
			.where(eq(table.user.id, userId));
	}
}
