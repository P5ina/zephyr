import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const assetGenerations = await db.query.assetGeneration.findMany({
		where: eq(table.assetGeneration.userId, locals.user.id),
		orderBy: desc(table.assetGeneration.createdAt),
		limit: 20,
	});

	return {
		user: locals.user,
		assetGenerations,
	};
};
