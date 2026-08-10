import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import sharp from 'sharp';
import { env } from '$env/dynamic/private';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import { chargeCredits, claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitSpinJob } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import * as guestAuth from '$lib/server/guest-auth';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.spin;

export const POST: RequestHandler = async ({
	request,
	locals,
	getClientAddress,
}) => {
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
			// Checked before minting a session, not after: a fresh session always
			// reads generationsUsed = 0, so the per-session cap below can never
			// reject a caller that simply omits the cookie.
			const ipAddress = getClientAddress();
			if (!(await guestAuth.canGuestGenerateFromIp(ipAddress))) {
				error(429, 'Free generation limit reached. Sign up to continue.');
			}
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
		const webhookUrl = buildFalWebhookUrl('spin', job.id);
		try {
			const falResponse = await submitSpinJob({
				imageUrl: blob.url,
				webhookUrl,
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
		const generationsRemaining =
			guestAuth.getGuestRemainingGenerations(guestSession) - 1;

		return json(
			{
				id: job.id,
				job,
				isGuest: true,
				generationsRemaining,
				guestSessionId: guestSession.id,
			},
			{
				headers: {
					'Set-Cookie': `${GUEST_CONFIG.cookieName}=${guestSession.id}; Path=/; HttpOnly; SameSite=Lax; Expires=${guestSession.expiresAt.toUTCString()}`,
				},
			},
		);
	}

	// Authenticated user flow.
	//
	// The charge is the affordability check. Testing locals.user.tokens first
	// would not help: it is a snapshot the auth hook loaded before the request
	// began, so every concurrent request holds the same stale copy and they all
	// pass. Here the balance predicate lives in the WHERE of the write, so only
	// one of them can succeed. Guests never reach this line — they pay nothing.
	const charge = await chargeCredits({
		userId: locals.user.id,
		cost: TOKEN_COST,
	});

	if (!charge) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}`);
	}

	// Taken from what was actually charged, not from snapshot arithmetic: the
	// job row records the split so a later refund restores the right buckets.
	const bonusDeduct = charge.bonusCharged;

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
	const webhookUrl = buildFalWebhookUrl('spin', job.id);
	try {
		const falResponse = await submitSpinJob({
			imageUrl: blob.url,
			webhookUrl,
		});

		await db
			.update(table.spinJob)
			.set({ falRequestId: falResponse.requestId })
			.where(eq(table.spinJob.id, jobId));
	} catch (err) {
		console.error('fal.ai submission failed:', err);

		// Marks the job failed and credits its cost back in one statement, so the
		// refund can only happen for a job this call actually claimed.
		await claimJobAndRefund({
			job: table.spinJob,
			jobId,
			errorMessage: 'Failed to submit job for processing',
			claimableWhen: sql`status <> 'failed'`,
		});

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

	// Reported from what the charge actually left behind. Deriving these from
	// locals.user would repeat the snapshot's arithmetic and could tell a client
	// it still has credit while the row says otherwise.
	return json({
		id: job.id,
		job,
		isGuest: false,
		tokensRemaining: charge.tokensAfter,
		bonusTokensRemaining: charge.bonusTokensAfter,
	});
};
