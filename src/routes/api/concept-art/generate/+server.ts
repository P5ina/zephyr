import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitConceptArtJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.conceptArt;

const VALID_IMAGE_SIZES = [
	'landscape_16_9',
	'landscape_4_3',
	'square_hd',
	'portrait_4_3',
	'portrait_16_9',
];

const STYLE_PREFIXES: Record<string, string> = {
	painterly: 'painterly concept art style, ',
	anime: 'anime concept art style, ',
	realistic: 'photorealistic concept art, ',
	'pixel-art': 'pixel art concept art, ',
	watercolor: 'watercolor concept art style, ',
	'sci-fi': 'sci-fi concept art, futuristic, ',
	fantasy: 'fantasy concept art, epic, ',
	'ink-drawing': 'ink drawing concept art, detailed linework, ',
};

interface ConceptArtGenerateRequest {
	prompt: string;
	imageSize?: string;
	style?: string;
	seed?: number;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: ConceptArtGenerateRequest = await request.json();

	if (!body.prompt?.trim()) {
		error(400, 'Prompt is required');
	}

	if (body.prompt.length > 2000) {
		error(400, 'Prompt must be 2000 characters or less');
	}

	const imageSize = body.imageSize || 'square_hd';
	if (!VALID_IMAGE_SIZES.includes(imageSize)) {
		error(400, 'Invalid image size');
	}

	const style = body.style || null;
	if (style && !STYLE_PREFIXES[style]) {
		error(400, 'Invalid style preset');
	}

	const total = locals.user.tokens + locals.user.bonusTokens;
	if (total < TOKEN_COST) {
		error(
			402,
			`Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`,
		);
	}

	// Deduct tokens (bonus first)
	const bonusDeduct = Math.min(locals.user.bonusTokens, TOKEN_COST);
	const regularDeduct = TOKEN_COST - bonusDeduct;

	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	const genId = nanoid();

	// Build the full prompt with style prefix
	const fullPrompt = style && STYLE_PREFIXES[style]
		? STYLE_PREFIXES[style] + body.prompt.trim()
		: body.prompt.trim();

	await db
		.insert(table.conceptArtGeneration)
		.values({
			id: genId,
			userId: locals.user.id,
			prompt: body.prompt.trim(),
			style,
			imageSize,
			status: 'pending',
			tokenCost: TOKEN_COST,
			bonusTokenCost: bonusDeduct,
			currentStage: 'Queued for processing...',
		});

	// Submit to fal.ai
	try {
		const falResponse = await submitConceptArtJob({
			prompt: fullPrompt,
			imageSize,
			seed: body.seed,
		});

		await db
			.update(table.conceptArtGeneration)
			.set({ falRequestId: falResponse.requestId })
			.where(eq(table.conceptArtGeneration.id, genId));
	} catch (err) {
		console.error('fal.ai submission failed:', err);

		// Refund tokens
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		await db
			.update(table.conceptArtGeneration)
			.set({
				status: 'failed',
				errorMessage: 'Failed to submit job for processing',
			})
			.where(eq(table.conceptArtGeneration.id, genId));

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

	return json({
		id: genId,
		status: 'pending',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
};
