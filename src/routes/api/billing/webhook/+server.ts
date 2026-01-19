import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { verifyIPNSignature, parseOrderId, PRICING, type IPNPayload } from '$lib/server/nowpayments';
import type { RequestHandler } from './$types';

// NowPayments payment statuses:
// waiting, confirming, confirmed, sending, partially_paid, finished, failed, refunded, expired

export const POST: RequestHandler = async ({ request }) => {
	const body = await request.text();
	const signature = request.headers.get('x-nowpayments-sig');

	// Verify signature
	if (!verifyIPNSignature(body, signature || '')) {
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	let payload: IPNPayload;
	try {
		payload = JSON.parse(body);
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	const { payment_id, payment_status, order_id, pay_currency, pay_amount, actually_paid } = payload;

	// Find the transaction by order_id
	const [transaction] = await db
		.select()
		.from(table.transaction)
		.where(eq(table.transaction.orderId, order_id));

	if (!transaction) {
		console.error(`Transaction not found for order_id: ${order_id}`);
		return json({ error: 'Transaction not found' }, { status: 404 });
	}

	// Update transaction with payment details
	await db
		.update(table.transaction)
		.set({
			nowpaymentsPaymentId: payment_id,
			payCurrency: pay_currency,
			payAmount: pay_amount?.toString(),
		})
		.where(eq(table.transaction.id, transaction.id));

	// Handle different payment statuses
	switch (payment_status) {
		case 'confirming':
			await db
				.update(table.transaction)
				.set({ status: 'confirmed' })
				.where(eq(table.transaction.id, transaction.id));
			break;

		case 'confirmed':
		case 'sending':
			// Payment confirmed but not yet finished
			await db
				.update(table.transaction)
				.set({ status: 'confirmed' })
				.where(eq(table.transaction.id, transaction.id));
			break;

		case 'finished':
			// Payment completed successfully
			await handlePaymentCompleted(transaction);
			break;

		case 'partially_paid':
			// Partial payment - could handle differently, but for now mark as pending
			console.warn(`Partial payment received for order ${order_id}: ${actually_paid}`);
			break;

		case 'failed':
		case 'refunded':
			await db
				.update(table.transaction)
				.set({ status: 'failed' })
				.where(eq(table.transaction.id, transaction.id));
			break;

		case 'expired':
			await db
				.update(table.transaction)
				.set({ status: 'expired' })
				.where(eq(table.transaction.id, transaction.id));
			break;
	}

	return json({ received: true });
};

async function handlePaymentCompleted(transaction: typeof table.transaction.$inferSelect) {
	// Skip if already completed
	if (transaction.status === 'completed') {
		return;
	}

	// Mark transaction as completed
	await db
		.update(table.transaction)
		.set({ status: 'completed' })
		.where(eq(table.transaction.id, transaction.id));

	const orderData = parseOrderId(transaction.orderId || '');
	if (!orderData) {
		console.error(`Invalid order_id format: ${transaction.orderId}`);
		return;
	}

	if (transaction.type === 'credit_pack') {
		// Add bonus tokens for credit pack purchase
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${transaction.tokensGranted}`,
			})
			.where(eq(table.user.id, transaction.userId));
	} else if (transaction.type === 'subscription') {
		// Handle subscription payment
		const [existingSub] = await db
			.select()
			.from(table.subscription)
			.where(eq(table.subscription.userId, transaction.userId));

		const nextPeriodEnd = new Date();
		nextPeriodEnd.setMonth(nextPeriodEnd.getMonth() + 1);

		if (existingSub) {
			// Update existing subscription
			await db
				.update(table.subscription)
				.set({
					tier: 'pro',
					status: 'active',
					currentPeriodEnd: nextPeriodEnd,
					monthlyTokenAllocation: PRICING.tiers.pro.monthlyTokens,
					updatedAt: new Date(),
				})
				.where(eq(table.subscription.id, existingSub.id));
		} else {
			// Create new subscription
			await db.insert(table.subscription).values({
				id: nanoid(),
				userId: transaction.userId,
				tier: 'pro',
				status: 'active',
				currentPeriodEnd: nextPeriodEnd,
				monthlyTokenAllocation: PRICING.tiers.pro.monthlyTokens,
			});
		}

		// Set tokens to Pro allocation
		await db
			.update(table.user)
			.set({ tokens: PRICING.tiers.pro.monthlyTokens })
			.where(eq(table.user.id, transaction.userId));
	}
}
