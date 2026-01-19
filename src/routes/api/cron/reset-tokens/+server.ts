import { json } from '@sveltejs/kit';
import { eq, lt, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret
	const authHeader = request.headers.get('authorization');
	if (authHeader !== `Bearer ${env.CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const now = new Date();

	// Find all active subscriptions where current period has ended
	// This handles both free and pro users who need token resets
	const expiredSubscriptions = await db
		.select({
			subscription: table.subscription,
		})
		.from(table.subscription)
		.where(
			and(
				eq(table.subscription.status, 'active'),
				lt(table.subscription.currentPeriodEnd, now)
			)
		);

	let resetCount = 0;

	for (const { subscription } of expiredSubscriptions) {
		// Reset tokens to monthly allocation
		await db
			.update(table.user)
			.set({ tokens: subscription.monthlyTokenAllocation })
			.where(eq(table.user.id, subscription.userId));

		// Update period end for free users (Pro users get updated via webhook)
		if (subscription.tier === 'free') {
			const nextPeriodEnd = new Date();
			nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

			await db
				.update(table.subscription)
				.set({
					currentPeriodEnd: nextPeriodEnd,
					updatedAt: new Date(),
				})
				.where(eq(table.subscription.id, subscription.id));
		}

		resetCount++;
	}

	return json({
		success: true,
		resetCount,
		timestamp: now.toISOString(),
	});
};
