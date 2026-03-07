// Shared pricing config (client-safe)
// Pay-as-you-go model with token packs

import { ANIMATION_META, type AnimationType } from '$lib/animation-config';

const TOKENS_PER_DOLLAR = 60; // Based on the best-value Studio pack.
const ANIMATION_BG_REMOVAL_USD_PER_FRAME = 0.018;
const WAN_USD_PER_VIDEO_SECOND = 0.04; // 480p rate

export const PRICING = {
	freeTokens: 50, // Tokens given on signup

	tokenCosts: {
		sprite: 3,
		texture: 4,
		rotation: 25,
		rotationNew: 12,
		rotationSingleView: 7,
		spin: 25,
		conceptArt: 4,
		conceptArtRestyle: 6,
		// animate4/animate8 replaced by getAnimationGenerationTokenCost()
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

export function getAnimationGenerationTokenCost(
	animationType: AnimationType,
	directionCount: 4 | 8,
): number {
	const meta = ANIMATION_META[animationType];
	const videoDuration = meta.duration * meta.loops;
	const wanCostPerDir = videoDuration * WAN_USD_PER_VIDEO_SECOND;
	const rmbgCostPerDir = meta.framesPerLoop * ANIMATION_BG_REMOVAL_USD_PER_FRAME;
	const totalUsd = (wanCostPerDir + rmbgCostPerDir) * directionCount;
	return Math.ceil(totalUsd * TOKENS_PER_DOLLAR);
}

export function getAnimationReprocessTokenCost(
	frameCountPerDirection: number,
	directionCount: 4 | 8,
): number {
	const totalFrames = frameCountPerDirection * directionCount;
	return Math.ceil(totalFrames * ANIMATION_BG_REMOVAL_USD_PER_FRAME * TOKENS_PER_DOLLAR);
}
