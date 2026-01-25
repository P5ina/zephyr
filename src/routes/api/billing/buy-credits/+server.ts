import { error, json } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { createPayment, createOrderId, PRICING, type CreditPackType } from '$lib/server/cryptomus';
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
		const payment = await createPayment({
			amount: pack.price,
			currency: 'USD',
			orderId,
			orderDescription: `GenSprite ${pack.name}`,
			callbackUrl: `${baseUrl}/api/billing/webhook`,
			successUrl: `${baseUrl}/app/billing?checkout=success`,
			cancelUrl: `${baseUrl}/app/billing?checkout=canceled`,
			lifetime: 3600, // 1 hour
		});

		// Log full response for debugging
		console.log('Cryptomus payment created:', JSON.stringify(payment, null, 2));

		// Create pending transaction
		await db.insert(table.transaction).values({
			id: nanoid(),
			userId: locals.user.id,
			cryptomusUuid: payment.uuid,
			orderId,
			type: 'credit_pack',
			amount: pack.price * 100, // Store in cents
			tokensGranted: pack.tokens,
			status: 'pending',
		});

		console.log('Redirecting to:', payment.url);
		return json({ url: payment.url });
	} catch (err) {
		console.error('Cryptomus payment creation error:', err);
		const message = err instanceof Error ? err.message : 'Failed to create payment';
		error(500, message);
	}
};
