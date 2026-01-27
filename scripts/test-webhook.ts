/**
 * Test Cryptomus webhook
 *
 * Usage:
 *   CRYPTOMUS_MERCHANT_ID=xxx CRYPTOMUS_API_KEY=yyy npx tsx scripts/test-webhook.ts
 *
 * Or set the values in .env and run:
 *   source .env && npx tsx scripts/test-webhook.ts
 */

import crypto from 'node:crypto';

const MERCHANT_ID = process.env.CRYPTOMUS_MERCHANT_ID;
const API_KEY = process.env.CRYPTOMUS_API_KEY;
const CALLBACK_URL = process.env.PUBLIC_BASE_URL
	? `${process.env.PUBLIC_BASE_URL}/api/billing/webhook`
	: 'https://gensprite.p5ina.dev/api/billing/webhook';

if (!MERCHANT_ID || !API_KEY) {
	console.error('Missing CRYPTOMUS_MERCHANT_ID or CRYPTOMUS_API_KEY in .env');
	process.exit(1);
}

function generateSignature(data: object): string {
	const jsonString = JSON.stringify(data);
	const base64 = Buffer.from(jsonString).toString('base64');
	return crypto
		.createHash('md5')
		.update(base64 + API_KEY)
		.digest('hex');
}

// Pass order_id as argument: npx tsx scripts/test-webhook.ts credit_pack_xxx_starter_123
const ORDER_ID = process.argv[2];

async function testWebhook() {
	if (!ORDER_ID) {
		console.log('Usage: npx tsx scripts/test-webhook.ts <order_id>');
		console.log(
			'Example: npx tsx scripts/test-webhook.ts credit_pack_abc123_starter_1234567890',
		);
		console.log(
			'\nGet the order_id from Vercel logs after creating a payment.',
		);
		process.exit(1);
	}

	const data = {
		url_callback: CALLBACK_URL,
		currency: 'USDT',
		network: 'tron',
		status: 'paid',
		order_id: ORDER_ID,
	};

	const sign = generateSignature(data);

	console.log('Testing webhook...');
	console.log('Callback URL:', CALLBACK_URL);
	console.log('Request data:', JSON.stringify(data, null, 2));

	try {
		const response = await fetch(
			'https://api.cryptomus.com/v1/test-webhook/payment',
			{
				method: 'POST',
				headers: {
					merchant: MERCHANT_ID,
					sign: sign,
					'Content-Type': 'application/json',
				},
				body: JSON.stringify(data),
			},
		);

		const result = await response.json();

		if (response.ok && result.state === 0) {
			console.log('\n✅ Test webhook sent successfully!');
			console.log('Response:', JSON.stringify(result, null, 2));
			console.log(
				'\nCheck your server logs to see if the webhook was received.',
			);
		} else {
			console.error('\n❌ Failed to send test webhook');
			console.error('Response:', JSON.stringify(result, null, 2));
		}
	} catch (error) {
		console.error('\n❌ Error:', error);
	}
}

testWebhook();
