import Stripe from 'stripe';
import { env } from '$env/dynamic/private';

let stripe: Stripe | null = null;

export function getStripe(): Stripe {
	if (!stripe) {
		if (!env.STRIPE_SECRET_KEY) {
			throw new Error('STRIPE_SECRET_KEY is not set');
		}
		stripe = new Stripe(env.STRIPE_SECRET_KEY);
	}
	return stripe;
}
