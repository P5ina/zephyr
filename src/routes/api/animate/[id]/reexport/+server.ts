import type { Config } from '@sveltejs/adapter-vercel';
import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { ANIMATION_META, type AnimationType } from '$lib/animation-config';
import { getAnimationReprocessTokenCost } from '$lib/pricing';
import { chargeCredits } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const config: Config = {
	runtime: 'nodejs22.x',
	memory: 3009,
	maxDuration: 120,
};

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const userId = locals.user.id;

	const job = await db.query.animationJob.findFirst({
		where: eq(table.animationJob.id, params.id),
	});

	if (!job || job.userId !== userId) {
		error(404, 'Job not found');
	}

	if (job.status !== 'completed') {
		error(400, 'Can only re-export completed jobs');
	}

	const directionVideos = job.directionVideos as Record<string, string> | null;
	if (!directionVideos || Object.keys(directionVideos).length === 0) {
		error(400, 'No direction videos available for re-export');
	}

	const frameCount =
		job.frameCount ??
		ANIMATION_META[job.animationType as AnimationType].framesPerLoop;
	const reexportCost = getAnimationReprocessTokenCost(
		frameCount,
		job.directionCount as 4 | 8,
	);

	// The charge is the affordability check. Testing locals.user.tokens first
	// would not help: it is a snapshot the auth hook loaded before the request
	// began, so every concurrent request holds the same stale copy and they all
	// pass. Here the balance predicate lives in the WHERE of the write, so only
	// one of them can succeed. Re-export is the most expensive of the three
	// per-request charges, so it is where the overdraft bit hardest: three
	// concurrent calls at 139 each against a 139 balance used to leave -278.
	const charge = await chargeCredits({ userId, cost: reexportCost });

	if (!charge) {
		error(402, `Not enough tokens. Required: ${reexportCost}`);
	}

	// The split comes from the charge, not from the snapshot: the job row records
	// it, and a refund pays each bucket back from that record.
	const { bonusCharged, regularCharged } = charge;

	/**
	 * Returns this request's own charge, in one statement.
	 *
	 * Deliberately not `claimJobAndRefund`: the animation job row is not the
	 * record of this charge. It carries whichever re-export won the transition
	 * below, so claiming it would credit that request's cost instead of this
	 * one's and flip a delivered animation to `failed`. There is no
	 * double-refund to guard against either — `chargeCredits` returning
	 * non-null means *this* request took the money, exactly once, and only
	 * this branch gives it back.
	 */
	async function refundOwnCharge(): Promise<void> {
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusCharged}`,
				tokens: sql`${table.user.tokens} + ${regularCharged}`,
			})
			.where(eq(table.user.id, userId));
	}

	// Claim the completed -> processing transition rather than writing it
	// unconditionally. The status read above happened before the charge, so a
	// second re-export of the same job would pass it too, and both would then
	// stamp their own cost over `token_cost`: the user would have paid twice
	// and the row would record one charge, so a cancel or a failure webhook
	// would pay back half of what was taken. Here the loser matches nothing and
	// gets its own charge back instead.
	let claimed: { id: string }[];
	try {
		claimed = await db
			.update(table.animationJob)
			.set({
				status: 'processing',
				currentStage: `Removing backgrounds (0/${frameCount * (job.directionCount as 4 | 8)})...`,
				completedAt: null,
				progress: 55,
				spritesheetUrl: null,
				frameCount: null,
				tileWidth: null,
				tileHeight: null,
				bgRemovalRequestIds: null,
				bgRemovedVideos: null,
				// The in-flight re-export's cost, not the original generation's.
				// While the row sits at 'processing' this is the amount at risk:
				// /api/animate/[id]/cancel and the fal webhook both refund
				// `token_cost`, and what they owe is this re-export, not the
				// animation the user already received.
				tokenCost: reexportCost,
				bonusTokenCost: bonusCharged,
				errorMessage: null,
			})
			.where(
				and(
					eq(table.animationJob.id, job.id),
					eq(table.animationJob.status, 'completed'),
				),
			)
			.returning({ id: table.animationJob.id });
	} catch (err) {
		console.error('[animate] Re-export claim failed:', err);
		await refundOwnCharge();
		throw err;
	}

	if (claimed.length === 0) {
		await refundOwnCharge();
		error(400, 'Can only re-export completed jobs');
	}

	// Reported from what the charge actually left behind. Deriving these from
	// locals.user would repeat the snapshot's arithmetic and could tell a client
	// it still has credit while the row says otherwise.
	return json({
		success: true,
		tokensRemaining: charge.tokensAfter,
		bonusTokensRemaining: charge.bonusTokensAfter,
	});
};
