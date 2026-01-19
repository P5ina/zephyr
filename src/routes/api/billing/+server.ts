import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { PRICING } from '$lib/server/nowpayments';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const [sub] = await db
		.select()
		.from(table.subscription)
		.where(eq(table.subscription.userId, locals.user.id));

	const [userData] = await db
		.select({
			tokens: table.user.tokens,
			bonusTokens: table.user.bonusTokens,
		})
		.from(table.user)
		.where(eq(table.user.id, locals.user.id));

	const tier = sub?.tier ?? 'free';
	const tierInfo = PRICING.tiers[tier as keyof typeof PRICING.tiers];

	return json({
		tier,
		tierName: tierInfo.name,
		status: sub?.status ?? 'active',
		currentPeriodEnd: sub?.currentPeriodEnd?.toISOString() ?? null,
		monthlyTokens: userData?.tokens ?? 0,
		bonusTokens: userData?.bonusTokens ?? 0,
		totalTokens: (userData?.tokens ?? 0) + (userData?.bonusTokens ?? 0),
		monthlyAllocation: tierInfo.monthlyTokens,
	});
};
