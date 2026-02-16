import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const generations = await db.query.conceptArtGeneration.findMany({
		where: eq(table.conceptArtGeneration.userId, locals.user.id),
		orderBy: [desc(table.conceptArtGeneration.createdAt)],
		limit: 20,
	});

	return {
		generations,
	};
};
