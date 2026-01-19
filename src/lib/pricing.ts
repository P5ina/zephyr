// Shared pricing config (client-safe)
// Minimum $25 for crypto payment compatibility
export const PRICING = {
	tiers: {
		free: {
			name: 'Free',
			monthlyTokens: 25,
			price: 0,
		},
		pro: {
			name: 'Pro',
			monthlyTokens: 2500,
			price: 25,
		},
	},
	creditPacks: {
		credits_500: {
			name: '500 Tokens',
			tokens: 500,
			price: 25,
		},
		credits_1500: {
			name: '1,500 Tokens',
			tokens: 1500,
			price: 50,
		},
		credits_5000: {
			name: '5,000 Tokens',
			tokens: 5000,
			price: 100,
		},
	},
} as const;

export type TierType = keyof typeof PRICING.tiers;
export type CreditPackType = keyof typeof PRICING.creditPacks;
