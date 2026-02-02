import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitSpinJob } from '$lib/server/fal';
import * as guestAuth from '$lib/server/guest-auth';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.spin;

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	const contentType = request.headers.get('content-type') || '';

	let imageBuffer: Buffer | null = null;

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const file = formData.get('image') as File | null;

		if (!file || file.size === 0) {
			error(400, 'Image is required');
		}

		if (file.size > 10 * 1024 * 1024) {
			error(400, 'Image must be less than 10MB');
		}

		const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
		if (!allowedTypes.includes(file.type)) {
			error(400, 'Image must be PNG, JPEG, or WebP');
		}

		// Convert to PNG for consistency, downscale large images
		// .rotate() without args auto-rotates based on EXIF orientation
		const rawBuffer = Buffer.from(await file.arrayBuffer());
		imageBuffer = await sharp(rawBuffer)
			.rotate()
			.resize(1024, 1024, {
				fit: 'inside',
				withoutEnlargement: true,
			})
			.png()
			.toBuffer();
	} else {
		error(400, 'Image upload required (multipart/form-data)');
	}

	if (!imageBuffer) {
		error(400, 'Image is required');
	}

	if (!env.BLOB_READ_WRITE_TOKEN) {
		error(500, 'Image upload not configured');
	}

	// Guest flow
	if (!locals.user) {
		let guestSession = locals.guestSession;
		if (!guestSession) {
			const ipAddress = getClientAddress();
			guestSession = await guestAuth.createGuestSession(ipAddress);
		}

		// Check generation limit
		if (!guestAuth.canGuestGenerate(guestSession)) {
			error(429, 'Free generation limit reached. Sign up to continue.');
		}

		// Upload image to Vercel Blob
		const blob = await put(
			`spins/guest-${guestSession.id}/${nanoid()}.png`,
			imageBuffer,
			{
				access: 'public',
				contentType: 'image/png',
				token: env.BLOB_READ_WRITE_TOKEN,
			},
		);

		// Create spin job record
		const jobId = nanoid();

		const [job] = await db
			.insert(table.spinJob)
			.values({
				id: jobId,
				guestSessionId: guestSession.id,
				status: 'pending',
				tokenCost: 0,
				bonusTokenCost: 0,
				inputImageUrl: blob.url,
				currentStage: 'Queued for processing...',
			})
			.returning();

		// Submit to fal.ai
		try {
			const falResponse = await submitSpinJob({
				imageUrl: blob.url,
			});

			await db
				.update(table.spinJob)
				.set({ falRequestId: falResponse.requestId })
				.where(eq(table.spinJob.id, jobId));
		} catch (err) {
			console.error('fal.ai submission failed:', err);

			await db
				.update(table.spinJob)
				.set({
					status: 'failed',
					errorMessage: 'Failed to submit job for processing',
				})
				.where(eq(table.spinJob.id, jobId));

			error(500, 'Failed to submit job for processing.');
		}

		// Increment guest usage
		await guestAuth.incrementGuestUsage(guestSession.id);
		const generationsRemaining = guestAuth.getGuestRemainingGenerations(guestSession) - 1;

		return json({
			id: job.id,
			job,
			isGuest: true,
			generationsRemaining,
			guestSessionId: guestSession.id,
		}, {
			headers: {
				'Set-Cookie': `${GUEST_CONFIG.cookieName}=${guestSession.id}; Path=/; HttpOnly; SameSite=Lax; Expires=${guestSession.expiresAt.toUTCString()}`,
			},
		});
	}

	// Authenticated user flow
	const total = locals.user.tokens + locals.user.bonusTokens;

	if (total < TOKEN_COST) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}, available: ${total}`);
	}

	// Deduct tokens before generation
	const bonusDeduct = Math.min(locals.user.bonusTokens, TOKEN_COST);
	const regularDeduct = TOKEN_COST - bonusDeduct;

	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	// Upload image to Vercel Blob
	const blob = await put(
		`spins/${locals.user.id}/${nanoid()}.png`,
		imageBuffer,
		{
			access: 'public',
			contentType: 'image/png',
			token: env.BLOB_READ_WRITE_TOKEN,
		},
	);

	// Create spin job record
	const jobId = nanoid();

	const [job] = await db
		.insert(table.spinJob)
		.values({
			id: jobId,
			userId: locals.user.id,
			status: 'pending',
			tokenCost: TOKEN_COST,
			bonusTokenCost: bonusDeduct,
			inputImageUrl: blob.url,
			currentStage: 'Queued for processing...',
		})
		.returning();

	// Submit to fal.ai
	try {
		const falResponse = await submitSpinJob({
			imageUrl: blob.url,
		});

		await db
			.update(table.spinJob)
			.set({ falRequestId: falResponse.requestId })
			.where(eq(table.spinJob.id, jobId));
	} catch (err) {
		console.error('fal.ai submission failed:', err);

		// Refund tokens
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		await db
			.update(table.spinJob)
			.set({
				status: 'failed',
				errorMessage: 'Failed to submit job for processing',
			})
			.where(eq(table.spinJob.id, jobId));

		error(500, 'Failed to submit job for processing. Tokens have been refunded.');
	}

	const tokensRemaining = locals.user.tokens - regularDeduct;
	const bonusRemaining = locals.user.bonusTokens - bonusDeduct;

	return json({
		id: job.id,
		job,
		isGuest: false,
		tokensRemaining,
		bonusTokensRemaining: bonusRemaining,
	});
};
