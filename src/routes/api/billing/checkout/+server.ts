import { json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { type CreditPackType, PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getStripe } from '$lib/server/stripe';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, request, url }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	const body = await request.json();
	const packType = body.packType as CreditPackType;

	if (!packType || !PRICING.creditPacks[packType]) {
		return json({ error: 'Invalid pack type' }, { status: 400 });
	}

	const pack = PRICING.creditPacks[packType];
	const transactionId = nanoid();

	// Create pending transaction
	await db.insert(table.transaction).values({
		id: transactionId,
		userId: locals.user.id,
		type: 'credit_pack',
		amount: pack.price,
		tokensGranted: pack.tokens,
		status: 'pending',
		payCurrency: 'usd',
		payAmount: String(pack.price),
	});

	const stripe = getStripe();
	const origin = url.origin;

	const session = await stripe.checkout.sessions.create({
		mode: 'payment',
		line_items: [
			{
				price_data: {
					currency: 'usd',
					product_data: {
						name: `${pack.name} Pack — ${pack.tokens.toLocaleString()} tokens`,
						description: `${pack.tokens.toLocaleString()} generation tokens for GenSprite`,
					},
					unit_amount: pack.price * 100, // Stripe uses cents
				},
				quantity: 1,
			},
		],
		metadata: {
			userId: locals.user.id,
			packType,
			transactionId,
		},
		success_url: `${origin}/app/billing/success?session_id={CHECKOUT_SESSION_ID}`,
		cancel_url: `${origin}/app/billing`,
		customer_email: locals.user.email,
	});

	// Store Stripe session ID on the transaction
	await db
		.update(table.transaction)
		.set({ orderId: session.id })
		.where(eq(table.transaction.id, transactionId));

	return json({ url: session.url });
};
