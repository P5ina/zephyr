import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import {
	verifyWebhookIP,
	verifyWebhookSignature,
	type WebhookPayload,
} from '$lib/server/cryptomus';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// Cryptomus payment statuses:
// confirm_check - waiting for confirmations
// paid - paid successfully
// paid_over - overpaid
// fail - payment failed
// wrong_amount - wrong amount sent
// cancel - cancelled
// system_fail - system error
// refund_process - refund in progress
// refund_fail - refund failed
// refund_paid - refunded

export const POST: RequestHandler = async ({ request, getClientAddress }) => {
	// Verify webhook IP (optional but recommended)
	const clientIP = request.headers.get('x-forwarded-for') || getClientAddress();
	if (!verifyWebhookIP(clientIP)) {
		console.warn(`Webhook received from unauthorized IP: ${clientIP}`);
		// Don't reject immediately - IP might be different in some setups
		// But log it for monitoring
	}

	let payload: WebhookPayload;
	try {
		payload = await request.json();
	} catch {
		return json({ error: 'Invalid JSON' }, { status: 400 });
	}

	// Verify signature
	if (!verifyWebhookSignature(payload)) {
		console.error('Invalid webhook signature');
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	const { uuid, status, order_id, payer_currency, payer_amount } = payload;

	// Find the transaction by order_id or uuid
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
			cryptomusUuid: uuid,
			payCurrency: payer_currency,
			payAmount: payer_amount,
		})
		.where(eq(table.transaction.id, transaction.id));

	// Handle different payment statuses
	switch (status) {
		case 'confirm_check':
			// Payment received, waiting for blockchain confirmations
			await db
				.update(table.transaction)
				.set({ status: 'confirmed' })
				.where(eq(table.transaction.id, transaction.id));
			break;

		case 'paid':
		case 'paid_over':
			// Payment completed successfully
			await handlePaymentCompleted(transaction);
			break;

		case 'wrong_amount':
			// Wrong amount sent - mark as failed
			console.warn(`Wrong amount for order ${order_id}`);
			await db
				.update(table.transaction)
				.set({ status: 'failed' })
				.where(eq(table.transaction.id, transaction.id));
			break;

		case 'fail':
		case 'cancel':
		case 'system_fail':
			await db
				.update(table.transaction)
				.set({ status: 'failed' })
				.where(eq(table.transaction.id, transaction.id));
			break;

		case 'refund_process':
		case 'refund_fail':
		case 'refund_paid':
			// Handle refunds - mark as failed/refunded
			await db
				.update(table.transaction)
				.set({ status: 'failed' })
				.where(eq(table.transaction.id, transaction.id));
			break;
	}

	return json({ received: true });
};

async function handlePaymentCompleted(
	transaction: typeof table.transaction.$inferSelect,
) {
	// Skip if already completed
	if (transaction.status === 'completed') {
		return;
	}

	// Mark transaction as completed
	await db
		.update(table.transaction)
		.set({ status: 'completed' })
		.where(eq(table.transaction.id, transaction.id));

	// Add tokens to user's balance (all purchases are now token packs)
	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} + ${transaction.tokensGranted}`,
		})
		.where(eq(table.user.id, transaction.userId));

	console.log(
		`Payment completed for user ${transaction.userId}: +${transaction.tokensGranted} tokens`,
	);
}
