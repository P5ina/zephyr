import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { releaseInstance } from '$lib/server/instance-manager';
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

	// Can only cancel if not already completed or failed
	if (asset.status === 'completed' || asset.status === 'failed') {
		error(400, 'Cannot cancel a completed or failed generation');
	}

	// Update status to failed (cancelled)
	await db
		.update(table.assetGeneration)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.assetGeneration.id, asset.id));

	// Refund tokens
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${asset.tokenCost}`,
		})
		.where(eq(table.user.id, asset.userId));

	// Release instance if it was assigned
	if (asset.vastInstanceId) {
		try {
			await releaseInstance(asset.vastInstanceId);
		} catch {
			// Ignore errors releasing instance
		}
	}

	return json({
		success: true,
		tokensRefunded: asset.tokenCost,
	});
};
