import { fal } from '@fal-ai/client';
import { error, isHttpError, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { PRICING } from '$lib/pricing';
import { chargeCredits } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import {
	calculateHorizontalAngle,
	DIRECTION_ANGLES,
	type RotationDirection,
	type SourceDirection,
} from '$lib/server/fal';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.rotationSingleView;
const FAL_SINGLE_VIEW_WORKFLOW_ID = 'workflows/P5ina/rotate-one-view';

const DIRECTION_COLUMNS = {
	front: 'rotationFront',
	right: 'rotationRight',
	back: 'rotationBack',
	left: 'rotationLeft',
} as const;

export const POST: RequestHandler = async ({ params, request, locals }) => {
	// Regeneration requires tokens, so only authenticated users can use it
	if (!locals.user) {
		error(401, 'Sign up to regenerate individual views');
	}

	const userId = locals.user.id;

	const body = await request.json();
	const targetDirection = body.targetDirection as RotationDirection;
	const sourceDirection = (body.sourceDirection as SourceDirection) || 'input';

	// Validate directions
	if (!['front', 'right', 'back', 'left'].includes(targetDirection)) {
		error(400, `Invalid target direction: ${targetDirection}`);
	}
	if (!(sourceDirection in DIRECTION_ANGLES)) {
		error(400, `Invalid source direction: ${sourceDirection}`);
	}

	// Get the job
	const job = await db.query.rotationJobNew.findFirst({
		where: and(
			eq(table.rotationJobNew.id, params.id),
			eq(table.rotationJobNew.userId, userId),
		),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	if (job.status !== 'completed') {
		error(400, 'Can only regenerate views on completed jobs');
	}

	// Original input image, or the rotated image for that direction
	const sourceImageUrl =
		sourceDirection === 'input'
			? job.inputImageUrl
			: job[DIRECTION_COLUMNS[sourceDirection]];

	if (!sourceImageUrl) {
		error(400, `Source image for ${sourceDirection} not available`);
	}

	// Configure fal. Checked before the charge: a missing key is a server
	// misconfiguration that cannot produce a view, and charging first would take
	// the tokens on a request that never reaches fal.ai.
	if (!env.FAL_KEY) {
		error(500, 'FAL_KEY not configured');
	}
	fal.config({ credentials: env.FAL_KEY });

	// The charge is the affordability check. Testing locals.user.tokens first
	// would not help: it is a snapshot the auth hook loaded before the request
	// began, so every concurrent request holds the same stale copy and they all
	// pass. Here the balance predicate lives in the WHERE of the write, so only
	// one of them can succeed.
	const charge = await chargeCredits({ userId, cost: TOKEN_COST });

	if (!charge) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}`);
	}

	// The split comes from the charge, not from the snapshot, so the refund below
	// returns each bucket exactly what it paid.
	const { bonusCharged, regularCharged } = charge;

	/**
	 * Returns this request's own charge, in one statement.
	 *
	 * Deliberately not `claimJobAndRefund`. A single-view regenerate charges per
	 * request and records nothing on the job row: the row is a `completed`
	 * rotation whose `token_cost` is the original four-view generation. Claiming
	 * it would refund that larger amount and flip an asset the user already has
	 * to `failed` — and with `NOT_TERMINAL` it would in fact claim nothing at
	 * all, leaving the user charged for a view they never got.
	 *
	 * There is no double-refund to guard against: `chargeCredits` returning
	 * non-null means *this* request took the money, exactly once, and exactly
	 * one of the branches below gives it back.
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

	// Calculate horizontal angle
	const horizontalAngle = calculateHorizontalAngle(
		sourceDirection,
		targetDirection,
	);

	console.log(
		`[fal.ai] Regenerating ${targetDirection} from ${sourceDirection}, angle: ${horizontalAngle}°`,
	);

	try {
		// Use subscribe for synchronous completion (simpler for single view)
		const result = await fal.subscribe(FAL_SINGLE_VIEW_WORKFLOW_ID, {
			input: {
				image_url: sourceImageUrl,
				elevation: job.elevation,
				horizontal_angle: horizontalAngle,
			},
		});

		console.log(
			'[fal.ai] Single view result:',
			JSON.stringify(result.data, null, 2),
		);

		const data = result.data as { rotated?: { url: string } };
		const newImageUrl = data?.rotated?.url;

		if (!newImageUrl) {
			// Refund tokens
			await refundOwnCharge();
			error(500, 'Failed to generate rotated view');
		}

		// Update the job with the new image
		const updateData: Record<string, string> = {};
		updateData[DIRECTION_COLUMNS[targetDirection]] = newImageUrl;

		await db
			.update(table.rotationJobNew)
			.set(updateData)
			.where(eq(table.rotationJobNew.id, job.id));

		// Reported from what the charge actually left behind, not from snapshot
		// arithmetic that could claim credit the row no longer holds.
		return json({
			success: true,
			direction: targetDirection,
			url: newImageUrl,
			tokensRemaining: charge.tokensAfter,
			bonusTokensRemaining: charge.bonusTokensAfter,
		});
	} catch (err) {
		// The branch above throws its own HttpError *after* refunding. Letting it
		// fall into this handler would refund the same charge a second time, so
		// it is rethrown untouched.
		if (isHttpError(err)) {
			throw err;
		}

		console.error('[fal.ai] Single view error:', err);

		// Refund tokens
		await refundOwnCharge();

		error(500, 'Failed to regenerate view. Tokens have been refunded.');
	}
};
