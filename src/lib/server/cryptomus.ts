import crypto from 'node:crypto';
import { env } from '$env/dynamic/private';
import { type CreditPackType, PRICING } from '$lib/pricing';

export { PRICING };
export type { CreditPackType };

if (!env.CRYPTOMUS_MERCHANT_ID) {
	throw new Error('CRYPTOMUS_MERCHANT_ID is not set');
}

if (!env.CRYPTOMUS_API_KEY) {
	throw new Error('CRYPTOMUS_API_KEY is not set');
}

const API_BASE = 'https://api.cryptomus.com/v1';

// Cryptomus webhook IP for whitelist verification
export const CRYPTOMUS_WEBHOOK_IP = '91.227.144.54';

interface CreatePaymentParams {
	amount: number;
	currency: string;
	orderId: string;
	orderDescription?: string;
	callbackUrl: string;
	successUrl: string;
	cancelUrl: string;
	lifetime?: number; // seconds, 300-43200, default 3600
}

interface CryptomusPaymentResponse {
	uuid: string;
	order_id: string;
	amount: string;
	payment_amount: string | null;
	payer_amount: string | null;
	discount_percent: number | null;
	discount: string;
	payer_currency: string | null;
	currency: string;
	merchant_amount: string | null;
	network: string | null;
	address: string | null;
	from: string | null;
	txid: string | null;
	payment_status: string;
	url: string;
	expired_at: number;
	status: string;
	is_final: boolean;
	additional_data: string | null;
	created_at: string;
	updated_at: string;
}

export interface WebhookPayload {
	type: string;
	uuid: string;
	order_id: string;
	amount: string;
	payment_amount: string;
	payment_amount_usd: string;
	merchant_amount: string;
	commission: string;
	is_final: boolean;
	status: string;
	from: string | null;
	wallet_address_uuid: string | null;
	network: string;
	currency: string;
	payer_currency: string;
	payer_amount: string;
	additional_data: string | null;
	txid: string | null;
	sign: string;
}

// Payment statuses:
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

function generateSignature(data: object): string {
	const jsonString = JSON.stringify(data, null, 0);
	const base64 = Buffer.from(jsonString).toString('base64');
	return crypto
		.createHash('md5')
		.update(base64 + env.CRYPTOMUS_API_KEY)
		.digest('hex');
}

async function apiRequest<T>(endpoint: string, data: object): Promise<T> {
	const sign = generateSignature(data);

	const response = await fetch(`${API_BASE}${endpoint}`, {
		method: 'POST',
		headers: {
			merchant: env.CRYPTOMUS_MERCHANT_ID,
			sign: sign,
			'Content-Type': 'application/json',
		},
		body: JSON.stringify(data),
	});

	const result = await response.json();

	if (!response.ok || result.state !== 0) {
		// Log full error for debugging
		console.error('Cryptomus API error:', JSON.stringify(result, null, 2));
		console.error('Request data:', JSON.stringify(data, null, 2));

		// Extract detailed error message
		let errorMessage =
			result.message || `Cryptomus API error: ${response.status}`;
		if (result.errors) {
			const errorDetails = Object.entries(result.errors)
				.map(
					([key, val]) =>
						`${key}: ${Array.isArray(val) ? val.join(', ') : val}`,
				)
				.join('; ');
			errorMessage += ` - ${errorDetails}`;
		}
		throw new Error(errorMessage);
	}

	return result.result;
}

export async function createPayment(
	params: CreatePaymentParams,
): Promise<CryptomusPaymentResponse> {
	const data: Record<string, unknown> = {
		amount: params.amount.toString(),
		currency: params.currency,
		order_id: params.orderId,
		url_return: params.cancelUrl,
		url_success: params.successUrl,
		url_callback: params.callbackUrl,
		is_payment_multiple: false, // Don't allow partial payments
	};

	if (params.orderDescription) {
		data.additional_data = params.orderDescription;
	}

	if (params.lifetime) {
		data.lifetime = params.lifetime;
	}

	return apiRequest<CryptomusPaymentResponse>('/payment', data);
}

export async function getPaymentInfo(
	uuid: string,
): Promise<CryptomusPaymentResponse> {
	return apiRequest<CryptomusPaymentResponse>('/payment/info', { uuid });
}

export function verifyWebhookSignature(payload: WebhookPayload): boolean {
	const { sign, ...data } = payload;

	// Cryptomus signature: MD5(base64(JSON body without sign) + API_KEY)
	const jsonString = JSON.stringify(data, null, 0);
	const base64 = Buffer.from(jsonString).toString('base64');
	const calculatedSign = crypto
		.createHash('md5')
		.update(base64 + env.CRYPTOMUS_API_KEY)
		.digest('hex');

	return calculatedSign === sign;
}

export function verifyWebhookIP(ip: string | null): boolean {
	if (!ip) return false;
	// Handle forwarded IPs (e.g., from Vercel)
	const clientIP = ip.split(',')[0].trim();
	return clientIP === CRYPTOMUS_WEBHOOK_IP;
}

export function parseOrderId(orderId: string): {
	type: 'subscription' | 'credit_pack';
	userId: string;
	pack?: CreditPackType;
	timestamp: number;
} | null {
	try {
		// Format: type_userId_pack_timestamp or type_userId_timestamp
		// Using underscores because Cryptomus only allows alphanumeric, dash, underscore
		const parts = orderId.split('_');
		if (parts.length < 3) return null;

		const type = parts[0] as 'subscription' | 'credit_pack';
		const userId = parts[1];

		if (type === 'credit_pack' && parts.length >= 4) {
			return {
				type,
				userId,
				pack: parts[2] as CreditPackType,
				timestamp: parseInt(parts[3], 10),
			};
		}

		return {
			type,
			userId,
			timestamp: parseInt(parts[2], 10),
		};
	} catch {
		return null;
	}
}

export function createOrderId(
	type: 'subscription' | 'credit_pack',
	userId: string,
	pack?: CreditPackType,
): string {
	const timestamp = Date.now();
	if (type === 'credit_pack' && pack) {
		// Using underscores - Cryptomus only allows alphanumeric, dash, underscore
		return `${type}_${userId}_${pack}_${timestamp}`;
	}
	return `${type}_${userId}_${timestamp}`;
}
