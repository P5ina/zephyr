import { error, json } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { createInvoice, createOrderId, PRICING, type CreditPackType } from '$lib/server/nowpayments';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

interface BuyCreditsRequest {
	pack: CreditPackType;
}

export const POST: RequestHandler = async ({ request, locals, url }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: BuyCreditsRequest = await request.json();
	const pack = PRICING.creditPacks[body.pack];

	if (!pack) {
		error(400, 'Invalid credit pack');
	}

	const baseUrl = env.PUBLIC_BASE_URL || url.origin;
	const orderId = createOrderId('credit_pack', locals.user.id, body.pack);

	try {
		const invoice = await createInvoice({
			priceAmount: pack.price,
			priceCurrency: 'usd',
			orderId,
			orderDescription: `Zephyr ${pack.name}`,
			callbackUrl: `${baseUrl}/api/billing/webhook`,
			successUrl: `${baseUrl}/?checkout=success`,
			cancelUrl: `${baseUrl}/?checkout=canceled`,
		});

		// Create pending transaction
		await db.insert(table.transaction).values({
			id: nanoid(),
			userId: locals.user.id,
			nowpaymentsInvoiceId: Number(invoice.id),
			orderId,
			type: 'credit_pack',
			amount: pack.price * 100, // Store in cents
			tokensGranted: pack.tokens,
			status: 'pending',
		});

		return json({ url: invoice.invoice_url });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to create payment';
		error(500, message);
	}
};
