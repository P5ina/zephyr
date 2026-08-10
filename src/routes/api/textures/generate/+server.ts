import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { PRICING } from '$lib/pricing';
import {
	chargeCredits,
	claimJobAndRefund,
	NOT_TERMINAL,
} from '$lib/server/credits';
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

	// The charge is the affordability check. Testing locals.user.tokens first
	// would not help: it is a snapshot the auth hook loaded before the request
	// began, so every concurrent request holds the same stale copy and they all
	// pass. Here the balance predicate lives in the WHERE of the write, so only
	// one of them can succeed.
	const charge = await chargeCredits({
		userId: locals.user.id,
		cost: TOKEN_COST,
	});

	if (!charge) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}`);
	}

	// Recorded on the job row so a later refund restores the right buckets.
	const bonusDeduct = charge.bonusCharged;

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
		const runpodResponse = await submitTextureJob({
			jobId: textureId,
			prompt: body.prompt.trim(),
		});

		// Store RunPod job ID for status polling
		await db
			.update(table.textureGeneration)
			.set({ runpodJobId: runpodResponse.id })
			.where(eq(table.textureGeneration.id, textureId));
	} catch (err) {
		// RunPod submission failed - refund tokens and mark as failed
		console.error('RunPod submission failed:', err);

		await claimJobAndRefund({
			job: table.textureGeneration,
			jobId: textureId,
			errorMessage: 'Failed to submit job for processing',
			claimableWhen: NOT_TERMINAL,
		});

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

	// Reported from what the charge actually left behind. Deriving these from
	// locals.user would repeat the snapshot's arithmetic and could tell a client
	// it still has credit while the row says otherwise.
	return json({
		id: texture.id,
		status: 'pending',
		tokensRemaining: charge.tokensAfter,
		bonusTokensRemaining: charge.bonusTokensAfter,
	});
};
