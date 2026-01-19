import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const jobs = await db.query.trainingJob.findMany({
		where: eq(table.trainingJob.userId, locals.user.id),
		orderBy: desc(table.trainingJob.createdAt),
	});

	return {
		user: locals.user,
		jobs,
	};
};
