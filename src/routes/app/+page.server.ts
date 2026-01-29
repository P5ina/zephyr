import { desc, eq, or, and, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, parent }) => {
	const parentData = await parent();

	// Get generations for this user or guest session
	let assetGenerations: table.AssetGeneration[] = [];

	if (locals.user) {
		assetGenerations = await db.query.assetGeneration.findMany({
			where: eq(table.assetGeneration.userId, locals.user.id),
			orderBy: desc(table.assetGeneration.createdAt),
			limit: 20,
		});
	} else if (locals.guestSession) {
		assetGenerations = await db.query.assetGeneration.findMany({
			where: eq(table.assetGeneration.guestSessionId, locals.guestSession.id),
			orderBy: desc(table.assetGeneration.createdAt),
			limit: 20,
		});
	}

	return {
		...parentData,
		assetGenerations,
	};
};
