import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelJob } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const texture = await db.query.textureGeneration.findFirst({
		where: and(
			eq(table.textureGeneration.id, params.id),
			eq(table.textureGeneration.userId, locals.user.id),
		),
	});

	if (!texture) {
		error(404, 'Texture not found');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	const hasResults = texture.basecolorUrl || texture.normalUrl;

	if (texture.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	if (texture.status === 'completed' && hasResults) {
		error(400, 'Cannot cancel a completed generation with results');
	}

	// Cancel the job on RunPod if it has a RunPod job ID
	if (texture.runpodJobId) {
		try {
			await cancelJob(texture.runpodJobId);
		} catch (e) {
			console.error('Failed to cancel RunPod job:', e);
		}
	}

	await db
		.update(table.textureGeneration)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.textureGeneration.id, texture.id));

	// Refund both regular and bonus tokens correctly
	const regularTokens = texture.tokenCost - texture.bonusTokenCost;
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${regularTokens}`,
			bonusTokens: sql`${table.user.bonusTokens} + ${texture.bonusTokenCost}`,
		})
		.where(eq(table.user.id, texture.userId));

	return json({
		success: true,
		tokensRefunded: texture.tokenCost,
		regularTokensRefunded: regularTokens,
		bonusTokensRefunded: texture.bonusTokenCost,
	});
};
