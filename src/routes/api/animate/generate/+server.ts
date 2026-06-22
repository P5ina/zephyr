import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import {
	ANIMATION_TYPES,
	type AnimationType,
	DIRECTIONS_4,
	DIRECTIONS_8,
	type Direction,
	ELEVATION_PRESETS,
	type ElevationPreset,
	getReferenceVideoUrl,
} from '$lib/animation-config';
import { getAnimationGenerationTokenCost } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitAnimateJob } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Sign in to use animations');
	}

	const contentType = request.headers.get('content-type') || '';

	if (!contentType.includes('multipart/form-data')) {
		error(400, 'Image upload required (multipart/form-data)');
	}

	const formData = await request.formData();

	let animationType: AnimationType = 'run';
	let elevation: ElevationPreset = 'iso';
	let directionCount: 4 | 8 = 4;

	const typeField = formData.get('animationType') as string | null;
	if (typeField && ANIMATION_TYPES.includes(typeField as AnimationType)) {
		animationType = typeField as AnimationType;
	}

	const elevField = formData.get('elevation') as string | null;
	if (elevField && ELEVATION_PRESETS.includes(elevField as ElevationPreset)) {
		elevation = elevField as ElevationPreset;
	}

	const dirField = formData.get('directionCount') as string | null;
	if (dirField === '8') {
		directionCount = 8;
	}

	const directions: readonly Direction[] =
		directionCount === 4 ? DIRECTIONS_4 : DIRECTIONS_8;

	// Images are uploaded directly to Blob from the browser; we only receive URLs.
	const directionImageUrls: Record<string, string> = {};

	for (const dir of directions) {
		const url = formData.get(`imageUrl_${dir}`) as string | null;
		if (url) {
			directionImageUrls[dir] = url;
		}
	}

	const providedDirections = Object.keys(directionImageUrls);
	if (providedDirections.length === 0) {
		error(400, 'At least one direction image is required');
	}

	const TOKEN_COST = getAnimationGenerationTokenCost(
		animationType,
		directionCount,
	);

	const total = locals.user.tokens + locals.user.bonusTokens;
	if (total < TOKEN_COST) {
		error(
			402,
			`Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`,
		);
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

	// Use the first uploaded image as the "primary" input image for display
	const firstDirection = directions.find((d) => directionImageUrls[d]);
	const inputImageUrl = firstDirection
		? directionImageUrls[firstDirection]
		: null;

	// Create animation job record
	const jobId = nanoid();

	const [job] = await db
		.insert(table.animationJob)
		.values({
			id: jobId,
			userId: locals.user.id,
			status: 'pending',
			tokenCost: TOKEN_COST,
			bonusTokenCost: bonusDeduct,
			inputImageUrl,
			directionInputImages: directionImageUrls,
			animationType,
			elevation,
			directionCount,
			currentStage: 'Submitting animation jobs...',
		})
		.returning();

	// Submit parallel fal.ai jobs for each direction that has an image
	try {
		const submissions = await Promise.all(
			providedDirections.map(async (direction) => {
				const referenceVideoUrl = getReferenceVideoUrl(
					animationType,
					elevation,
					direction as Direction,
				);
				const webhookUrl = buildFalWebhookUrl('animate', jobId, { direction });
				const result = await submitAnimateJob({
					imageUrl: directionImageUrls[direction],
					videoUrl: referenceVideoUrl,
					webhookUrl,
				});
				return { direction, requestId: result.requestId };
			}),
		);

		const falRequestIds: Record<string, string> = {};
		for (const { direction, requestId } of submissions) {
			falRequestIds[direction] = requestId;
		}

		await db
			.update(table.animationJob)
			.set({
				falRequestIds,
				status: 'processing',
				currentStage: `Processing ${providedDirections.length} directions...`,
				progress: 5,
			})
			.where(eq(table.animationJob.id, jobId));
	} catch (err) {
		console.error('fal.ai animation submission failed:', err);

		// Refund tokens
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		await db
			.update(table.animationJob)
			.set({
				status: 'failed',
				errorMessage: 'Failed to submit animation jobs',
			})
			.where(eq(table.animationJob.id, jobId));

		error(500, 'Failed to submit animation jobs. Tokens have been refunded.');
	}

	const tokensRemaining = locals.user.tokens - regularDeduct;
	const bonusRemaining = locals.user.bonusTokens - bonusDeduct;

	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: locals.user.id,
		event: 'animation_started',
		properties: {
			animation_type: animationType,
			elevation,
			direction_count: directionCount,
			directions_provided: providedDirections.length,
			token_cost: TOKEN_COST,
		},
	});
	await posthog.flush();

	return json({
		id: job.id,
		job: { ...job, falRequestIds: {}, status: 'processing', progress: 5 },
		isGuest: false,
		tokensRemaining,
		bonusTokensRemaining: bonusRemaining,
	});
};
