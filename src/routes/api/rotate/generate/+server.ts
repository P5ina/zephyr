import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const TOKEN_COST = 8;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const prompt = body.prompt as string | undefined;
	const mode = (body.mode as string) || 'regular';
	const pixelResolution = body.pixelResolution as number | undefined;
	const colorCount = body.colorCount as number | undefined;

	if (!prompt || prompt.trim().length === 0) {
		error(400, 'Prompt is required');
	}

	if (prompt.length > 500) {
		error(400, 'Prompt must be less than 500 characters');
	}

	const total = locals.user.tokens + locals.user.bonusTokens;
	if (total < TOKEN_COST) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`);
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

	// Create rotation job record with 'pending' status
	// The worker running on Vast.ai will pick this up and process it
	const jobId = nanoid();

	const [job] = await db
		.insert(table.rotationJob)
		.values({
			id: jobId,
			userId: locals.user.id,
			status: 'pending',
			tokenCost: TOKEN_COST,
			prompt: prompt.trim(),
			mode: mode === 'pixel_art' ? 'pixel_art' : 'regular',
			pixelResolution,
			colorCount,
			currentStage: 'Queued for processing...',
		})
		.returning();

	return json({
		id: job.id,
		status: 'pending',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
}
