import { error, json } from '@sveltejs/kit';
import { fal } from '@fal-ai/client';
import { and, eq, sql } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { DIRECTION_ANGLES_8DIR, calculateHorizontalAngle8Dir, type RotationDirection8Dir, type SourceDirection8Dir } from '$lib/server/fal';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.rotationSingleView;
const FAL_SINGLE_VIEW_WORKFLOW_ID = 'workflows/P5ina/rotate-one-view';

const DIRECTION_COLUMNS = {
	n: 'rotationN',
	ne: 'rotationNE',
	e: 'rotationE',
	se: 'rotationSE',
	s: 'rotationS',
	sw: 'rotationSW',
	w: 'rotationW',
	nw: 'rotationNW',
} as const;

const VALID_DIRECTIONS = Object.keys(DIRECTION_COLUMNS);

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		error(401, 'Sign up to regenerate individual views');
	}

	const body = await request.json();
	const targetDirection = body.targetDirection as RotationDirection8Dir;
	const sourceDirection = (body.sourceDirection as SourceDirection8Dir) || 'input';

	if (!VALID_DIRECTIONS.includes(targetDirection)) {
		error(400, `Invalid target direction: ${targetDirection}`);
	}
	if (!(sourceDirection in DIRECTION_ANGLES_8DIR)) {
		error(400, `Invalid source direction: ${sourceDirection}`);
	}

	const job = await db.query.rotationJob.findFirst({
		where: and(
			eq(table.rotationJob.id, params.id),
			eq(table.rotationJob.userId, locals.user.id),
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
		sourceImageUrl = job.inputImageUrl;
	} else {
		sourceImageUrl = job[DIRECTION_COLUMNS[sourceDirection as RotationDirection8Dir]];
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

	const horizontalAngle = calculateHorizontalAngle8Dir(sourceDirection, targetDirection);

	console.log(`[fal.ai] Regenerating 8dir ${targetDirection} from ${sourceDirection}, angle: ${horizontalAngle}°`);

	if (!env.FAL_KEY) {
		error(500, 'FAL_KEY not configured');
	}
	fal.config({ credentials: env.FAL_KEY });

	try {
		const result = await fal.subscribe(FAL_SINGLE_VIEW_WORKFLOW_ID, {
			input: {
				image_url: sourceImageUrl,
				elevation: job.elevation,
				horizontal_angle: horizontalAngle,
			},
		});

		const data = result.data as { rotated?: { url: string } };
		const newImageUrl = data?.rotated?.url;

		if (!newImageUrl) {
			await db
				.update(table.user)
				.set({
					bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
					tokens: sql`${table.user.tokens} + ${regularDeduct}`,
				})
				.where(eq(table.user.id, locals.user.id));
			error(500, 'Failed to generate rotated view');
		}

		const updateData: Record<string, string> = {};
		updateData[DIRECTION_COLUMNS[targetDirection]] = newImageUrl;

		await db
			.update(table.rotationJob)
			.set(updateData)
			.where(eq(table.rotationJob.id, job.id));

		return json({
			success: true,
			direction: targetDirection,
			url: newImageUrl,
			tokensRemaining: locals.user.tokens - regularDeduct,
			bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
		});
	} catch (err) {
		console.error('[fal.ai] Single view error:', err);

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
