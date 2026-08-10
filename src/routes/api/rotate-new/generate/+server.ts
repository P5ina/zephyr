import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '$env/dynamic/private';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import { chargeCredits, claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitRotationJob } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import * as guestAuth from '$lib/server/guest-auth';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.rotationNew;

async function parseInput(request: Request, ownerId: string) {
	const contentType = request.headers.get('content-type') || '';
	let inputImageUrl: string | undefined;
	let elevation: number = 0;

	if (contentType.includes('multipart/form-data')) {
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
			inputImageUrl = imageUrl;
		} else if (file && file.size > 0) {
			if (file.size > 10 * 1024 * 1024) {
				error(400, 'Image must be less than 10MB');
			}
			const allowedTypes = ['image/png', 'image/jpeg', 'image/webp'];
			if (!allowedTypes.includes(file.type)) {
				error(400, 'Image must be PNG, JPEG, or WebP');
			}
			if (!env.BLOB_READ_WRITE_TOKEN) {
				error(500, 'Image upload not configured.');
			}
			const blob = await put(`rotations-new/${ownerId}/${nanoid()}.png`, file, {
				access: 'public',
				contentType: file.type,
				token: env.BLOB_READ_WRITE_TOKEN,
			});
			inputImageUrl = blob.url;
		}
	} else {
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

	return { inputImageUrl, elevation };
}

export const POST: RequestHandler = async ({
	request,
	locals,
	getClientAddress,
}) => {
	// Guest flow
	if (!locals.user) {
		let guestSession = locals.guestSession;
		if (!guestSession) {
			// Checked before minting a session, not after: a fresh session always
			// reads generationsUsed = 0, so the per-session cap below can never
			// reject a caller that simply omits the cookie.
			const ipAddress = getClientAddress();
			if (!(await guestAuth.canGuestGenerateFromIp(ipAddress))) {
				error(429, 'Free rotation limit reached. Sign up to continue.');
			}
			guestSession = await guestAuth.createGuestSession(ipAddress);
		}

		if (!(await guestAuth.canGuestRotate(guestSession.id))) {
			error(429, 'Free rotation limit reached. Sign up to continue.');
		}

		const { inputImageUrl, elevation } = await parseInput(
			request,
			`guest-${guestSession.id}`,
		);

		const jobId = nanoid();
		const [job] = await db
			.insert(table.rotationJobNew)
			.values({
				id: jobId,
				guestSessionId: guestSession.id,
				status: 'pending',
				tokenCost: 0,
				bonusTokenCost: 0,
				inputImageUrl,
				elevation,
				currentStage: 'Queued for processing...',
			})
			.returning();

		const webhookUrl = buildFalWebhookUrl('rotation4', job.id);

		try {
			const falResponse = await submitRotationJob({
				imageUrl: inputImageUrl,
				elevation,
				webhookUrl,
			});

			await db
				.update(table.rotationJobNew)
				.set({ falRequestId: falResponse.requestId })
				.where(eq(table.rotationJobNew.id, jobId));
		} catch (err) {
			console.error('fal.ai submission failed:', err);

			await db
				.update(table.rotationJobNew)
				.set({
					status: 'failed',
					errorMessage: 'Failed to submit job for processing',
				})
				.where(eq(table.rotationJobNew.id, jobId));

			error(500, 'Failed to submit job for processing.');
		}

		await guestAuth.incrementGuestUsage(guestSession.id);
		const generationsRemaining = await guestAuth.getGuestRotationsRemaining(
			guestSession.id,
		);

		return json(
			{
				id: job.id,
				job,
				status: 'pending',
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

	// Authenticated user flow
	const { inputImageUrl, elevation } = await parseInput(
		request,
		locals.user.id,
	);

	// The charge is the affordability check. Testing locals.user.tokens first
	// would not help: it is a snapshot the auth hook loaded before the request
	// began, so every concurrent request holds the same stale copy and they all
	// pass. Here the balance predicate lives in the WHERE of the write, so only
	// one of them can succeed.
	const charge = await chargeCredits({
		userId: locals.user.id,
		cost: TOKEN_COST,
	});

	if (!charge) {
		error(402, `Not enough tokens. Required: ${TOKEN_COST}`);
	}

	// Taken from what the charge actually spent, not from the snapshot: the job
	// row records the split so a later refund returns each part to the bucket it
	// came from.
	const bonusDeduct = charge.bonusCharged;

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

	const webhookUrl = buildFalWebhookUrl('rotation4', job.id);

	try {
		const falResponse = await submitRotationJob({
			imageUrl: inputImageUrl,
			elevation,
			webhookUrl,
		});

		await db
			.update(table.rotationJobNew)
			.set({ falRequestId: falResponse.requestId })
			.where(eq(table.rotationJobNew.id, jobId));
	} catch (err) {
		console.error('fal.ai submission failed:', err);

		// Marking failed and crediting the cost back are one statement, so a job
		// the webhook already finished is not refunded and no job is refunded
		// twice.
		await claimJobAndRefund({
			job: table.rotationJobNew,
			jobId,
			errorMessage: 'Failed to submit job for processing',
			claimableWhen: sql`status NOT IN ('completed', 'failed')`,
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
		status: 'pending',
		isGuest: false,
		tokensRemaining: charge.tokensAfter,
		bonusTokensRemaining: charge.bonusTokensAfter,
	});
};
