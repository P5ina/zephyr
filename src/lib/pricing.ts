// Shared pricing config (client-safe)
// Pay-as-you-go model with token packs

export const PRICING = {
	freeTokens: 50, // Tokens given on signup

	tokenCosts: {
		sprite: 2,
		texture: 5,
		rotation: 8,
	},

	creditPacks: {
		starter: {
			name: 'Starter',
			tokens: 500,
			price: 10, // $0.02 per token
			popular: false,
		},
		creator: {
			name: 'Creator',
			tokens: 2000,
			price: 25, // $0.0125 per token - 37% off
			popular: true,
		},
		studio: {
			name: 'Studio',
			tokens: 6000,
			price: 50, // $0.0083 per token - 58% off
			popular: false,
		},
	},
} as const;

export type CreditPackType = keyof typeof PRICING.creditPacks;
