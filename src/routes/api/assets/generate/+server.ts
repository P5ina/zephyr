import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
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
			negativePrompt: body.negativePrompt,
			width,
			height,
			status: 'pending',
			tokenCost: cost,
			currentStage: 'Queued for processing...',
		})
		.returning();

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
