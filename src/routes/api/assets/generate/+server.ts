import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitSpriteJob } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

const TOKEN_COSTS: Record<string, number> = {
	sprite: PRICING.tokenCosts.sprite,
	texture: PRICING.tokenCosts.texture,
};

interface AssetGenerateRequest {
	assetType?: 'sprite' | 'texture';
	prompt: string;
	width?: number;
	height?: number;
	seed?: number;
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

	// Create asset record with 'pending' status - worker will pick it up
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
			width,
			height,
			status: 'pending',
			tokenCost: cost,
			bonusTokenCost: bonusDeduct,
			currentStage: 'Queued for processing...',
		})
		.returning();

	// Submit to RunPod for processing
	try {
		const runpodResponse = await submitSpriteJob({
			jobId: assetId,
			prompt: body.prompt,
			width,
			height,
			seed: body.seed,
		});

		// Store RunPod job ID for status polling
		await db
			.update(table.assetGeneration)
			.set({ runpodJobId: runpodResponse.id })
			.where(eq(table.assetGeneration.id, assetId));
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
			.update(table.assetGeneration)
			.set({
				status: 'failed',
				errorMessage: 'Failed to submit job for processing',
			})
			.where(eq(table.assetGeneration.id, assetId));

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

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
