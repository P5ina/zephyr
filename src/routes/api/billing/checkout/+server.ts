import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { createInvoice, createOrderId, PRICING } from '$lib/server/nowpayments';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals, url }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// Check if already has active Pro subscription
	const [sub] = await db
		.select()
		.from(table.subscription)
		.where(eq(table.subscription.userId, locals.user.id));

	if (sub?.tier === 'pro' && sub.status === 'active') {
		error(400, 'Already subscribed to Pro');
	}

	const baseUrl = env.PUBLIC_BASE_URL || url.origin;
	const orderId = createOrderId('subscription', locals.user.id);

	try {
		const invoice = await createInvoice({
			priceAmount: PRICING.tiers.pro.price,
			priceCurrency: 'usd',
			orderId,
			orderDescription: 'Zephyr Pro Subscription (1 month)',
			callbackUrl: `${baseUrl}/api/billing/webhook`,
			successUrl: `${baseUrl}/?checkout=success`,
			cancelUrl: `${baseUrl}/?checkout=canceled`,
		});

		// Create pending transaction
		await db.insert(table.transaction).values({
			id: nanoid(),
			userId: locals.user.id,
			nowpaymentsInvoiceId: parseInt(invoice.id, 10),
			orderId,
			type: 'subscription',
			amount: PRICING.tiers.pro.price * 100, // Store in cents
			tokensGranted: PRICING.tiers.pro.monthlyTokens,
			status: 'pending',
		});

		return json({ url: invoice.invoice_url });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create payment';
		error(500, message);
	}
};
