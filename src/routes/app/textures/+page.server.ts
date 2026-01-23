import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return { textureGenerations: [] };
	}

	const textureGenerations = await db.query.textureGeneration.findMany({
		where: eq(table.textureGeneration.userId, locals.user.id),
		orderBy: [desc(table.textureGeneration.createdAt)],
		limit: 20,
	});

	return {
		textureGenerations,
	};
};
