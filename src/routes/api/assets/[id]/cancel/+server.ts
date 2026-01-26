import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const asset = await db.query.assetGeneration.findFirst({
		where: and(
			eq(table.assetGeneration.id, params.id),
			eq(table.assetGeneration.userId, locals.user.id),
		),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	const hasResults = asset.resultUrls?.processed || asset.resultUrls?.raw;

	if (asset.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	if (asset.status === 'completed' && hasResults) {
		error(400, 'Cannot cancel a completed generation with results');
	}

	await db
		.update(table.assetGeneration)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.assetGeneration.id, asset.id));

	// Refund both regular and bonus tokens correctly
	const regularTokens = asset.tokenCost - asset.bonusTokenCost;
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${regularTokens}`,
			bonusTokens: sql`${table.user.bonusTokens} + ${asset.bonusTokenCost}`,
		})
		.where(eq(table.user.id, asset.userId));

	return json({
		success: true,
		tokensRefunded: asset.tokenCost,
		regularTokensRefunded: regularTokens,
		bonusTokensRefunded: asset.bonusTokenCost,
	});
};
