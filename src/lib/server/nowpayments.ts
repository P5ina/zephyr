import { env } from '$env/dynamic/private';
import crypto from 'crypto';
import { PRICING } from '$lib/pricing';

export { PRICING };
export type { TierType, CreditPackType } from '$lib/pricing';

if (!env.NOWPAYMENTS_API_KEY) {
	throw new Error('NOWPAYMENTS_API_KEY is not set');
}

const API_BASE = 'https://api.nowpayments.io/v1';

interface CreatePaymentParams {
	priceAmount: number;
	priceCurrency: string;
	orderId: string;
	orderDescription: string;
	callbackUrl: string;
	successUrl: string;
	cancelUrl: string;
}

interface NowPaymentsInvoice {
	id: string;
	token_id: string;
	order_id: string;
	order_description: string;
	price_amount: number;
	price_currency: string;
	invoice_url: string;
	created_at: string;
	updated_at: string;
}

interface NowPaymentsPayment {
	payment_id: number;
	invoice_id: number;
	payment_status: string;
	pay_address: string;
	price_amount: number;
	price_currency: string;
	pay_amount: number;
	pay_currency: string;
	order_id: string;
	order_description: string;
	purchase_id: string;
	outcome_amount: number;
	outcome_currency: string;
}

export interface IPNPayload {
	payment_id: number;
	invoice_id: number;
	payment_status: string;
	pay_address: string;
	price_amount: number;
	price_currency: string;
	pay_amount: number;
	pay_currency: string;
	order_id: string;
	order_description: string;
	purchase_id: string;
	actually_paid: number;
	actually_paid_at_fiat: number;
	outcome_amount: number;
	outcome_currency: string;
}

async function apiRequest<T>(
	endpoint: string,
	options: RequestInit = {}
): Promise<T> {
	const response = await fetch(`${API_BASE}${endpoint}`, {
		...options,
		headers: {
			'x-api-key': env.NOWPAYMENTS_API_KEY!,
			'Content-Type': 'application/json',
			...options.headers,
		},
	});

	if (!response.ok) {
		const error = await response.json().catch(() => ({}));
		throw new Error(error.message || `NowPayments API error: ${response.status}`);
	}

	return response.json();
}

export async function createInvoice(
	params: CreatePaymentParams
): Promise<NowPaymentsInvoice> {
	return apiRequest<NowPaymentsInvoice>('/invoice', {
		method: 'POST',
		body: JSON.stringify({
			price_amount: params.priceAmount,
			price_currency: params.priceCurrency,
			order_id: params.orderId,
			order_description: params.orderDescription,
			ipn_callback_url: params.callbackUrl,
			success_url: params.successUrl,
			cancel_url: params.cancelUrl,
		}),
	});
}

export async function getPaymentStatus(paymentId: number): Promise<NowPaymentsPayment> {
	return apiRequest<NowPaymentsPayment>(`/payment/${paymentId}`);
}

export async function getMinimumPaymentAmount(
	currencyFrom: string,
	currencyTo: string = 'usd'
): Promise<{ min_amount: number }> {
	return apiRequest<{ min_amount: number }>(
		`/min-amount?currency_from=${currencyFrom}&currency_to=${currencyTo}`
	);
}

export async function getAvailableCurrencies(): Promise<{ currencies: string[] }> {
	return apiRequest<{ currencies: string[] }>('/currencies');
}

export function verifyIPNSignature(payload: string, signature: string): boolean {
	if (!env.NOWPAYMENTS_IPN_SECRET) {
		console.warn('NOWPAYMENTS_IPN_SECRET not set, skipping signature verification');
		return true;
	}

	const hmac = crypto.createHmac('sha512', env.NOWPAYMENTS_IPN_SECRET);
	hmac.update(payload);
	const calculatedSignature = hmac.digest('hex');

	return calculatedSignature === signature;
}

export function parseOrderId(orderId: string): {
	type: 'subscription' | 'credit_pack';
	userId: string;
	pack?: CreditPackType;
	timestamp: number;
} | null {
	try {
		// Format: type:userId:pack:timestamp or type:userId:timestamp
		const parts = orderId.split(':');
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
	pack?: CreditPackType
): string {
	const timestamp = Date.now();
	if (type === 'credit_pack' && pack) {
		return `${type}:${userId}:${pack}:${timestamp}`;
	}
	return `${type}:${userId}:${timestamp}`;
}
