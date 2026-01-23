import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { PRICING } from '$lib/pricing';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const [userData] = await db
		.select({
			tokens: table.user.tokens,
			bonusTokens: table.user.bonusTokens,
		})
		.from(table.user)
		.where(eq(table.user.id, locals.user.id));

	return json({
		tokens: userData?.tokens ?? 0,
		bonusTokens: userData?.bonusTokens ?? 0,
		totalTokens: (userData?.tokens ?? 0) + (userData?.bonusTokens ?? 0),
		tokenCosts: PRICING.tokenCosts,
	});
};
