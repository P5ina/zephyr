// Shared pricing config (client-safe)
// Pay-as-you-go model with token packs

export const PRICING = {
	freeTokens: 50, // Tokens given on signup

	tokenCosts: {
		sprite: 3,
		texture: 4,
		rotation: 6,
		rotationNew: 25,
		rotationSingleView: 7,
		spin: 25,
	},

	creditPacks: {
		starter: {
			name: 'Starter',
			tokens: 300,
			price: 10, // $0.0333 per token
			popular: false,
		},
		creator: {
			name: 'Creator',
			tokens: 1200,
			price: 25, // $0.0208 per token - 37% off
			popular: true,
		},
		studio: {
			name: 'Studio',
			tokens: 3000,
			price: 50, // $0.0167 per token - 50% off
			popular: false,
		},
	},
} as const;

export type CreditPackType = keyof typeof PRICING.creditPacks;
