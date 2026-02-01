// Promo code configuration
// Codes are case-insensitive

export interface PromoCode {
	code: string;
	bonusTokens: number;
	expiresAt: Date;
	description: string;
}

export const PROMO_CODES: PromoCode[] = [
	{
		code: 'PRODUCTHUNT',
		bonusTokens: 100,
		expiresAt: new Date('2026-08-01'), // 6 months from launch
		description: 'Product Hunt launch bonus',
	},
];

export const PROMO_COOKIE_NAME = 'promo_code';

export function validatePromoCode(code: string): PromoCode | null {
	const normalizedCode = code.toUpperCase().trim();
	const promo = PROMO_CODES.find((p) => p.code.toUpperCase() === normalizedCode);

	if (!promo) {
		return null;
	}

	if (new Date() > promo.expiresAt) {
		return null;
	}

	return promo;
}
