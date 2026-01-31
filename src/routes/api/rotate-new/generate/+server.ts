import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '$env/dynamic/private';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitRotationJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.rotationNew;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const contentType = request.headers.get('content-type') || '';

	let inputImageUrl: string | undefined;
	let elevation: number = 20;

	if (contentType.includes('multipart/form-data')) {
		// Handle file upload
		const formData = await request.formData();
		const file = formData.get('image') as File | null;
		const imageUrl = formData.get('imageUrl') as string | null;
		const elevationStr = formData.get('elevation') as string | null;
		if (elevationStr) {
			const parsed = parseInt(elevationStr, 10);
			if (!Number.isNaN(parsed) && parsed >= -90 && parsed <= 90) {
				elevation = parsed;
			}
		}

		if (imageUrl) {
			// Using existing image URL (e.g., from a previous sprite generation)
			inputImageUrl = imageUrl;
		} else if (file && file.size > 0) {
			// Upload new image to Vercel Blob
			if (file.size > 10 * 1024 * 1024) {
				error(400, 'Image must be less than 10MB');
			}

			const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
			if (!allowedTypes.includes(file.type)) {
				error(400, 'Image must be PNG, JPEG, or WebP');
			}

			if (!env.BLOB_READ_WRITE_TOKEN) {
				error(
					500,
					'Image upload not configured. Please use an existing sprite or contact support.',
				);
			}

			const blob = await put(
				`rotations-new/${locals.user.id}/${nanoid()}.png`,
				file,
				{
					access: 'public',
					contentType: file.type,
					token: env.BLOB_READ_WRITE_TOKEN,
				},
			);
			inputImageUrl = blob.url;
		}
	} else {
		// Handle JSON body
		const body = await request.json();
		inputImageUrl = body.imageUrl as string | undefined;
		if (
			typeof body.elevation === 'number' &&
			body.elevation >= -90 &&
			body.elevation <= 90
		) {
			elevation = body.elevation;
		}
	}

	if (!inputImageUrl) {
		error(400, 'Image is required. Upload an image or provide an image URL.');
	}

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

	// Create rotation job record with 'pending' status
	const jobId = nanoid();

	const [job] = await db
		.insert(table.rotationJobNew)
		.values({
			id: jobId,
			userId: locals.user.id,
			status: 'pending',
			tokenCost: TOKEN_COST,
			bonusTokenCost: bonusDeduct,
			inputImageUrl,
			elevation,
			currentStage: 'Queued for processing...',
		})
		.returning();

	// Submit to fal.ai for processing
	try {
		const falResponse = await submitRotationJob({
			imageUrl: inputImageUrl,
			elevation,
		});

		// Store fal.ai request ID for status polling
		await db
			.update(table.rotationJobNew)
			.set({ falRequestId: falResponse.requestId })
			.where(eq(table.rotationJobNew.id, jobId));
	} catch (err) {
		// fal.ai submission failed - refund tokens and mark as failed
		console.error('fal.ai submission failed:', err);

		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		await db
			.update(table.rotationJobNew)
			.set({
				status: 'failed',
				errorMessage: 'Failed to submit job for processing',
			})
			.where(eq(table.rotationJobNew.id, jobId));

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

	return json({
		id: job.id,
		job,
		status: 'pending',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
};
