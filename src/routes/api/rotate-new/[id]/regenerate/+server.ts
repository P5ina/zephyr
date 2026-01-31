import { error, json } from '@sveltejs/kit';
import { fal } from '@fal-ai/client';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { DIRECTION_ANGLES, calculateHorizontalAngle, type RotationDirection, type SourceDirection } from '$lib/server/fal';
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
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

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
			eq(table.rotationJobNew.userId, locals.user.id),
		),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	if (job.status !== 'completed') {
		error(400, 'Can only regenerate views on completed jobs');
	}

	// Get the source image URL
	let sourceImageUrl: string | null = null;
	if (sourceDirection === 'input') {
		// Use original input image
		sourceImageUrl = job.inputImageUrl;
	} else {
		// Use the rotated image for that direction
		sourceImageUrl = job[DIRECTION_COLUMNS[sourceDirection]];
	}

	if (!sourceImageUrl) {
		error(400, `Source image for ${sourceDirection} not available`);
	}

	// Check tokens
	const total = locals.user.tokens + locals.user.bonusTokens;
	if (total < TOKEN_COST) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`);
	}

	// Deduct tokens
	const bonusDeduct = Math.min(locals.user.bonusTokens, TOKEN_COST);
	const regularDeduct = TOKEN_COST - bonusDeduct;

	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	// Calculate horizontal angle
	const horizontalAngle = calculateHorizontalAngle(sourceDirection, targetDirection);

	console.log(`[fal.ai] Regenerating ${targetDirection} from ${sourceDirection}, angle: ${horizontalAngle}°`);

	// Configure fal
	if (!env.FAL_KEY) {
		error(500, 'FAL_KEY not configured');
	}
	fal.config({ credentials: env.FAL_KEY });

	try {
		// Use subscribe for synchronous completion (simpler for single view)
		const result = await fal.subscribe(FAL_SINGLE_VIEW_WORKFLOW_ID, {
			input: {
				image_url: sourceImageUrl,
				elevation: job.elevation,
				horizontal_angle: horizontalAngle,
			},
		});

		console.log('[fal.ai] Single view result:', JSON.stringify(result.data, null, 2));

		const data = result.data as { rotated?: { url: string } };
		const newImageUrl = data?.rotated?.url;

		if (!newImageUrl) {
			// Refund tokens
			await db
				.update(table.user)
				.set({
					bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
					tokens: sql`${table.user.tokens} + ${regularDeduct}`,
				})
				.where(eq(table.user.id, locals.user.id));
			error(500, 'Failed to generate rotated view');
		}

		// Update the job with the new image
		const updateData: Record<string, string> = {};
		updateData[DIRECTION_COLUMNS[targetDirection]] = newImageUrl;

		await db
			.update(table.rotationJobNew)
			.set(updateData)
			.where(eq(table.rotationJobNew.id, job.id));

		return json({
			success: true,
			direction: targetDirection,
			url: newImageUrl,
			tokensRemaining: locals.user.tokens - regularDeduct,
			bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
		});
	} catch (err) {
		console.error('[fal.ai] Single view error:', err);

		// Refund tokens
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		error(500, 'Failed to regenerate view. Tokens have been refunded.');
	}
};
