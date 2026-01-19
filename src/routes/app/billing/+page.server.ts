import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const [subscription, transactions] = await Promise.all([
		db.query.subscription.findFirst({
			where: eq(table.subscription.userId, locals.user.id),
		}),
		db.query.transaction.findMany({
			where: eq(table.transaction.userId, locals.user.id),
			orderBy: desc(table.transaction.createdAt),
			limit: 50,
		}),
	]);

	return {
		user: locals.user,
		subscription,
		transactions,
	};
};
