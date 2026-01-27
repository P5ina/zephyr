import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelJob } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// Force flag allows deleting stuck generations without refund
	const force = url.searchParams.get('force') === 'true';

	const asset = await db.query.assetGeneration.findFirst({
		where: and(
			eq(table.assetGeneration.id, params.id),
			eq(table.assetGeneration.userId, locals.user.id),
		),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	// Check if already failed (no double refund)
	if (asset.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	// Or if force flag is set, allow deletion without refund
	const hasResults = asset.resultUrls?.processed || asset.resultUrls?.raw;
	const shouldRefund = asset.status !== 'completed' || !hasResults;

	// If completed with results and not forcing, reject
	if (asset.status === 'completed' && hasResults && !force) {
		error(
			400,
			'Cannot cancel a completed generation with results. Use ?force=true to delete without refund.',
		);
	}

	// Cancel the job on RunPod if it has a RunPod job ID
	if (asset.runpodJobId) {
		try {
			await cancelJob(asset.runpodJobId);
		} catch (e) {
			console.error('Failed to cancel RunPod job:', e);
		}
	}

	await db
		.update(table.assetGeneration)
		.set({
			status: 'failed',
			errorMessage: force ? 'Deleted by user' : 'Cancelled by user',
		})
		.where(eq(table.assetGeneration.id, asset.id));

	// Refund tokens only if generation wasn't actually completed
	let regularTokensRefunded = 0;
	let bonusTokensRefunded = 0;

	if (shouldRefund) {
		regularTokensRefunded = asset.tokenCost - asset.bonusTokenCost;
		bonusTokensRefunded = asset.bonusTokenCost;
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${regularTokensRefunded}`,
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusTokensRefunded}`,
			})
			.where(eq(table.user.id, asset.userId));
	}

	return json({
		success: true,
		tokensRefunded: regularTokensRefunded + bonusTokensRefunded,
		regularTokensRefunded,
		bonusTokensRefunded,
		wasForced: force,
	});
};
