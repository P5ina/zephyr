import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return { rotationJobs: [] };
	}

	const rotationJobs = await db.query.rotationJob.findMany({
		where: eq(table.rotationJob.userId, locals.user.id),
		orderBy: [desc(table.rotationJob.createdAt)],
		limit: 20,
	});

	return {
		rotationJobs,
	};
};
