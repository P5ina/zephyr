import { json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { getPostHogClient } from '$lib/server/posthog';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request }) => {
	const stripe = getStripe();
	const body = await request.text();
	const signature = request.headers.get('stripe-signature');

	if (!signature) {
		return json({ error: 'Missing signature' }, { status: 400 });
	}

	if (!env.STRIPE_WEBHOOK_SECRET) {
		console.error('STRIPE_WEBHOOK_SECRET is not set');
		return json({ error: 'Webhook not configured' }, { status: 500 });
	}

	let event: Stripe.Event;
	try {
		event = stripe.webhooks.constructEvent(
			body,
			signature,
			env.STRIPE_WEBHOOK_SECRET,
		);
	} catch (err) {
		console.error('Webhook signature verification failed:', err);
		return json({ error: 'Invalid signature' }, { status: 400 });
	}

	if (event.type === 'checkout.session.completed') {
		const session = event.data.object;
		const { userId, transactionId } = session.metadata ?? {};

		if (!userId || !transactionId) {
			console.error('Missing metadata in checkout session:', session.id);
			return json({ received: true });
		}

		// Idempotency: only process if transaction is still pending
		const [txn] = await db
			.select()
			.from(table.transaction)
			.where(eq(table.transaction.id, transactionId));

		if (!txn || txn.status !== 'pending') {
			// Already processed or not found
			return json({ received: true });
		}

		// Grant tokens and mark transaction completed
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${txn.tokensGranted}`,
			})
			.where(eq(table.user.id, userId));

		await db
			.update(table.transaction)
			.set({ status: 'completed' })
			.where(eq(table.transaction.id, transactionId));

		console.log(
			`Granted ${txn.tokensGranted} tokens to user ${userId} (transaction ${transactionId})`,
		);

		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: userId,
			event: 'tokens_purchased',
			properties: {
				tokens_granted: txn.tokensGranted,
				amount_usd: txn.amount,
				pack_type: session.metadata?.packType,
				transaction_id: transactionId,
			},
		});
		await posthog.flush();
	}

	if (event.type === 'checkout.session.expired') {
		const session = event.data.object;
		const { transactionId } = session.metadata ?? {};

		if (transactionId) {
			await db
				.update(table.transaction)
				.set({ status: 'expired' })
				.where(eq(table.transaction.id, transactionId));
		}
	}

	return json({ received: true });
};
