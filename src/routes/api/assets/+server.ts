import { error, json } from '@sveltejs/kit';
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	// Build ownership condition
	let ownershipCondition;
	if (locals.user) {
		ownershipCondition = eq(table.assetGeneration.userId, locals.user.id);
	} else if (locals.guestSession) {
		ownershipCondition = eq(table.assetGeneration.guestSessionId, locals.guestSession.id);
	} else {
		error(401, 'Unauthorized');
	}

	const cursor = url.searchParams.get('cursor');
	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 50);

	// If we have a cursor, get assets created before the cursor's asset
	let cursorDate: Date | null = null;
	if (cursor) {
		const cursorAsset = await db.query.assetGeneration.findFirst({
			where: eq(table.assetGeneration.id, cursor),
			columns: { createdAt: true },
		});
		if (cursorAsset) {
			cursorDate = cursorAsset.createdAt;
		}
	}

	const assets = await db.query.assetGeneration.findMany({
		where: cursorDate
			? and(ownershipCondition, lt(table.assetGeneration.createdAt, cursorDate))
			: ownershipCondition,
		orderBy: desc(table.assetGeneration.createdAt),
		limit: limit + 1, // Fetch one extra to check if there are more
	});

	// Check if there are more results
	const hasMore = assets.length > limit;
	const returnedAssets = hasMore ? assets.slice(0, limit) : assets;
	const nextCursor = hasMore ? returnedAssets[returnedAssets.length - 1].id : null;

	return json({
		assets: returnedAssets,
		nextCursor,
	});
};
