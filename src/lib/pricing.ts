// Shared pricing config (client-safe)
// Pay-as-you-go model with token packs

export const PRICING = {
	freeTokens: 50, // Tokens given on signup

	tokenCosts: {
		sprite: 2,
		texture: 4,
		rotation: 6,
		rotationNew: 25,
		rotationSingleView: 7,
	},

	creditPacks: {
		starter: {
			name: 'Starter',
			tokens: 300,
			price: 5, // $0.017 per token
			popular: false,
		},
		creator: {
			name: 'Creator',
			tokens: 1200,
			price: 15, // $0.0125 per token - 25% off
			popular: true,
		},
		studio: {
			name: 'Studio',
			tokens: 4000,
			price: 35, // $0.00875 per token - 48% off
			popular: false,
		},
	},
} as const;

export type CreditPackType = keyof typeof PRICING.creditPacks;
