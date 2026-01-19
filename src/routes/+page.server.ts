import type { PageServerLoad } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, desc } from 'drizzle-orm';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		return {
			user: null,
			loras: [],
			generations: [],
		};
	}

	const [loras, generations] = await Promise.all([
		db.query.lora.findMany({
			where: eq(table.lora.userId, locals.user.id),
			orderBy: desc(table.lora.createdAt),
		}),
		db.query.generation.findMany({
			where: eq(table.generation.userId, locals.user.id),
			orderBy: desc(table.generation.createdAt),
			limit: 20,
		}),
	]);

	return {
		user: locals.user,
		loras,
		generations,
	};
};
