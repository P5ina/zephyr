import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitTextureJob } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.texture;

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
		error(
			402,
			`Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`,
		);
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

	// Create texture generation record with 'pending' status - worker will pick it up
	const textureId = nanoid();

	const [texture] = await db
		.insert(table.textureGeneration)
		.values({
			id: textureId,
			userId: locals.user.id,
			prompt: body.prompt.trim(),
			status: 'pending',
			tokenCost: TOKEN_COST,
			bonusTokenCost: bonusDeduct,
			currentStage: 'Queued for processing...',
		})
		.returning();

	// Submit to RunPod for processing
	try {
		await submitTextureJob({
			jobId: textureId,
			prompt: body.prompt.trim(),
		});
	} catch (err) {
		// RunPod submission failed - refund tokens and mark as failed
		console.error('RunPod submission failed:', err);

		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		await db
			.update(table.textureGeneration)
			.set({
				status: 'failed',
				errorMessage: 'Failed to submit job for processing',
			})
			.where(eq(table.textureGeneration.id, textureId));

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

	return json({
		id: texture.id,
		status: 'pending',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
};
