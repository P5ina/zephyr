// Shared pricing config (client-safe)
// Minimum $10 for crypto payment compatibility
export const PRICING = {
	tiers: {
		free: {
			name: 'Free',
			monthlyTokens: 25,
			price: 0,
		},
		pro: {
			name: 'Pro',
			monthlyTokens: 1000,
			price: 10,
		},
	},
	creditPacks: {
		credits_100: {
			name: '100 Tokens',
			tokens: 100,
			price: 10,
		},
		credits_500: {
			name: '500 Tokens',
			tokens: 500,
			price: 25,
		},
		credits_1000: {
			name: '1,000 Tokens',
			tokens: 1000,
			price: 40,
		},
	},
} as const;

export type TierType = keyof typeof PRICING.tiers;
export type CreditPackType = keyof typeof PRICING.creditPacks;
