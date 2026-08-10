import { json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import type Stripe from 'stripe';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getPostHogClient } from '$lib/server/posthog';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

interface GrantedPurchase {
	/** The buyer, taken from the claimed row rather than the echoed metadata. */
	userId: string;
	tokensGranted: number;
	/** Price paid, in whole USD, for reporting. */
	amount: number;
}

/**
 * Claims the transaction's `pending -> completed` transition and grants its
 * tokens in the same statement.
 *
 * Returns null when nothing was claimed — the transaction is missing, or some
 * earlier delivery already completed it. A null result means this delivery
 * granted nothing and must not grant anything.
 *
 * Why it has to be one statement: the driver is neon-http, which has no session
 * and therefore no interactive transaction (`db.transaction()` throws), and
 * Stripe delivery is at-least-once. The previous shape read `status` first,
 * granted unconditionally, and wrote `completed` a round trip later, so two
 * overlapping deliveries of the same `checkout.session.completed` both saw
 * 'pending' and both granted — free tokens, once per retry.
 *
 * Here the grant is a CTE dependent on the claim: under READ COMMITTED the
 * second UPDATE blocks on the row lock, re-evaluates `status = 'pending'`
 * against the committed row, matches nothing, and its `claimed` CTE is empty —
 * so the dependent UPDATE of the balance never runs. Granting twice is not
 * unlikely, it is unrepresentable.
 *
 * `bonus_tokens` is credited (not `tokens`) because that is the bucket
 * purchased packs have always landed in, and it is the bucket spent first.
 */
async function claimTransactionAndGrant(
	transactionId: string,
): Promise<GrantedPurchase | null> {
	const result = await db.execute(sql`
		WITH claimed AS (
			UPDATE ${table.transaction}
			   SET status = 'completed'
			 WHERE id = ${transactionId}
			   AND status = 'pending'
			RETURNING user_id, tokens_granted, amount
		), granted AS (
			UPDATE "user" u
			   SET bonus_tokens = u.bonus_tokens + c.tokens_granted
			  FROM claimed c
			 WHERE u.id = c.user_id
			RETURNING u.id
		)
		SELECT user_id, tokens_granted, amount FROM claimed
	`);

	const row = result.rows[0] as
		{ user_id: string; tokens_granted: number; amount: number } | undefined;
	if (!row) return null;

	return {
		userId: row.user_id,
		tokensGranted: Number(row.tokens_granted),
		amount: Number(row.amount),
	};
}

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

		// Idempotency IS the state transition. Reading the status first and
		// granting afterwards would let two overlapping deliveries of this same
		// event both observe 'pending' and both pay out.
		const purchase = await claimTransactionAndGrant(transactionId);

		if (!purchase) {
			// Already completed by an earlier delivery, or no such transaction.
			// Nothing was written and nothing was granted.
			return json({ received: true });
		}

		console.log(
			`Granted ${purchase.tokensGranted} tokens to user ${purchase.userId} (transaction ${transactionId})`,
		);

		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: purchase.userId,
			event: 'tokens_purchased',
			properties: {
				tokens_granted: purchase.tokensGranted,
				amount_usd: purchase.amount,
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
			// Only a still-pending transaction may expire. Stripe should never send
			// this for a session that completed, but the write is unconditional
			// otherwise, and a stray delivery would mark a paid, granted purchase
			// 'expired' — a row that says unpaid while the tokens are spent.
			await db
				.update(table.transaction)
				.set({ status: 'expired' })
				.where(
					and(
						eq(table.transaction.id, transactionId),
						eq(table.transaction.status, 'pending'),
					),
				);
		}
	}

	return json({ received: true });
};
