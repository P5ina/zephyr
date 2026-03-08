import { redirect } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const [keys, transactions] = await Promise.all([
		db
			.select({
				id: table.apiKey.id,
				keyPrefix: table.apiKey.keyPrefix,
				createdAt: table.apiKey.createdAt,
				lastUsedAt: table.apiKey.lastUsedAt,
				revokedAt: table.apiKey.revokedAt,
			})
			.from(table.apiKey)
			.where(eq(table.apiKey.userId, locals.user.id))
			.orderBy(desc(table.apiKey.createdAt)),
		db
			.select()
			.from(table.creditTransaction)
			.where(eq(table.creditTransaction.userId, locals.user.id))
			.orderBy(desc(table.creditTransaction.createdAt))
			.limit(50),
	]);

	return {
		user: locals.user,
		keys,
		transactions,
	};
};
