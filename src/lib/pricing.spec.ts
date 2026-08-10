import { describe, expect, it } from 'vitest';
import { ANIMATION_META, ANIMATION_TYPES } from '$lib/animation-config';
import {
	getAnimationGenerationTokenCost,
	getAnimationReprocessTokenCost,
	PRICING,
} from '$lib/pricing';

describe('credit packs', () => {
	const packs = Object.values(PRICING.creditPacks);

	it('every pack has a positive whole number of tokens and a positive price', () => {
		for (const pack of packs) {
			expect(Number.isInteger(pack.tokens), `${pack.name} tokens`).toBe(true);
			expect(pack.tokens, `${pack.name} tokens`).toBeGreaterThan(0);
			expect(pack.price, `${pack.name} price`).toBeGreaterThan(0);
		}
	});

	it('exactly one pack is marked popular', () => {
		expect(packs.filter((p) => p.popular)).toHaveLength(1);
	});

	// The business rule the pricing table exists to express: buying more must
	// never be worse value. A typo in tokens or price would silently break this
	// and only surface as a customer complaint.
	it('price per token strictly decreases as packs get larger', () => {
		const bySize = [...packs].sort((a, b) => a.tokens - b.tokens);
		for (let i = 1; i < bySize.length; i++) {
			const prev = bySize[i - 1];
			const curr = bySize[i];
			const prevRate = prev.price / prev.tokens;
			const currRate = curr.price / curr.tokens;
			expect(currRate, `${curr.name} vs ${prev.name} $/token`).toBeLessThan(
				prevRate,
			);
		}
	});
});

describe('getAnimationGenerationTokenCost', () => {
	it('returns a positive whole number of tokens for every animation type', () => {
		for (const type of ANIMATION_TYPES) {
			for (const dirs of [4, 8] as const) {
				const cost = getAnimationGenerationTokenCost(type, dirs);
				expect(Number.isInteger(cost), `${type}/${dirs}`).toBe(true);
				expect(cost, `${type}/${dirs}`).toBeGreaterThan(0);
			}
		}
	});

	// Cost is (per-direction USD) × directionCount, then ceil'd — so doubling
	// the directions doubles the cost up to a single token of rounding.
	it('doubling the direction count doubles the cost, within rounding', () => {
		for (const type of ANIMATION_TYPES) {
			const four = getAnimationGenerationTokenCost(type, 4);
			const eight = getAnimationGenerationTokenCost(type, 8);
			expect(eight, `${type}`).toBeGreaterThan(four);
			expect(
				Math.abs(eight - four * 2),
				`${type} rounding drift`,
			).toBeLessThanOrEqual(1);
		}
	});

	it('costs more for animations with more frames or longer video', () => {
		// run: 19 frames × 6 loops × 0.6s. walk: 31 frames × 3 loops × 1.0s.
		// walk has more frames AND more video seconds, so it must cost more.
		expect(ANIMATION_META.walk.framesPerLoop).toBeGreaterThan(
			ANIMATION_META.run.framesPerLoop,
		);
		expect(getAnimationGenerationTokenCost('walk', 4)).toBeGreaterThan(
			getAnimationGenerationTokenCost('run', 4),
		);
	});
});

describe('getAnimationReprocessTokenCost', () => {
	it('never charges more than a fresh generation of the same animation', () => {
		// Reprocessing only re-runs background removal; it must not cost more
		// than generating the video from scratch, or users would rationally
		// regenerate instead of reprocessing.
		for (const type of ANIMATION_TYPES) {
			for (const dirs of [4, 8] as const) {
				const frames = ANIMATION_META[type].framesPerLoop;
				const reprocess = getAnimationReprocessTokenCost(frames, dirs);
				const generate = getAnimationGenerationTokenCost(type, dirs);
				expect(reprocess, `${type}/${dirs}`).toBeLessThan(generate);
			}
		}
	});

	it('is monotonic in frame count', () => {
		let prev = 0;
		for (const frames of [1, 10, 19, 31, 100]) {
			const cost = getAnimationReprocessTokenCost(frames, 4);
			expect(cost, `${frames} frames`).toBeGreaterThanOrEqual(prev);
			prev = cost;
		}
	});

	it('charges nothing for zero frames', () => {
		expect(getAnimationReprocessTokenCost(0, 8)).toBe(0);
	});
});
