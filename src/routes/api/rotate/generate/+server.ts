import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '$env/dynamic/private';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import {
	chargeCredits,
	claimJobAndRefund,
	NOT_TERMINAL,
} from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitRotation8DirJob } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import * as guestAuth from '$lib/server/guest-auth';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

const TOKEN_COST = PRICING.tokenCosts.rotation;

async function parseInput(request: Request, ownerId: string) {
	const contentType = request.headers.get('content-type') || '';
	let inputImageUrl: string | undefined;
	let prompt: string | undefined;
	let elevation: number = 0;

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();
		const file = formData.get('image') as File | null;
		const imageUrl = formData.get('imageUrl') as string | null;
		prompt = (formData.get('prompt') as string | null) || undefined;
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
			const blob = await put(`rotations/${ownerId}/${nanoid()}.png`, file, {
				access: 'public',
				contentType: file.type,
				token: env.BLOB_READ_WRITE_TOKEN,
			});
			inputImageUrl = blob.url;
		}
	} else {
		const body = await request.json();
		inputImageUrl = body.imageUrl as string | undefined;
		prompt = body.prompt as string | undefined;
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

	return { inputImageUrl, prompt, elevation };
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
			// The address allowance and the insert are one statement. Checking
			// first and minting afterwards leaves a window in which simultaneous
			// cookie-less requests all read zero and all mint a session, which is
			// the same read-check-write defect being cleared out elsewhere.
			const minted = await guestAuth.createGuestSessionForAddress({
				ipAddress: getClientAddress(),
				cap: GUEST_CONFIG.maxRotationGenerations,
			});
			if (!minted) {
				error(429, 'Free rotation limit reached. Sign up to continue.');
			}
			guestSession = minted;
		}

		if (!(await guestAuth.canGuestRotate(guestSession.id))) {
			error(429, 'Free rotation limit reached. Sign up to continue.');
		}

		const { inputImageUrl, prompt, elevation } = await parseInput(
			request,
			`guest-${guestSession.id}`,
		);

		const jobId = nanoid();
		const [job] = await db
			.insert(table.rotationJob)
			.values({
				id: jobId,
				guestSessionId: guestSession.id,
				status: 'pending',
				tokenCost: 0,
				bonusTokenCost: 0,
				prompt: prompt?.trim() || null,
				inputImageUrl,
				elevation,
				currentStage: 'Queued for processing...',
			})
			.returning();

		const webhookUrl = buildFalWebhookUrl('rotation8', job.id);

		try {
			const falResponse = await submitRotation8DirJob({
				imageUrl: inputImageUrl,
				elevation,
				webhookUrl,
			});

			await db
				.update(table.rotationJob)
				.set({ runpodJobId: falResponse.requestId })
				.where(eq(table.rotationJob.id, jobId));
		} catch (err) {
			console.error('fal.ai submission failed:', err);

			await db
				.update(table.rotationJob)
				.set({
					status: 'failed',
					errorMessage: 'Failed to submit job for processing',
				})
				.where(eq(table.rotationJob.id, jobId));

			error(500, 'Failed to submit job for processing.');
		}

		await guestAuth.incrementGuestUsage(guestSession.id);
		const generationsRemaining = await guestAuth.getGuestRotationsRemaining(
			guestSession.id,
		);

		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: `guest-${guestSession.id}`,
			event: 'rotation_started',
			properties: {
				is_guest: true,
				job_id: job.id,
				elevation,
				has_prompt: !!prompt,
			},
		});
		await posthog.flush();

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
	const { inputImageUrl, prompt, elevation } = await parseInput(
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

	// Taken from the charge, not from the snapshot: the job row records the split
	// so a later refund puts each part back in the bucket it came out of.
	const bonusDeduct = charge.bonusCharged;

	const jobId = nanoid();
	const [job] = await db
		.insert(table.rotationJob)
		.values({
			id: jobId,
			userId: locals.user.id,
			status: 'pending',
			tokenCost: TOKEN_COST,
			bonusTokenCost: bonusDeduct,
			prompt: prompt?.trim() || null,
			inputImageUrl,
			elevation,
			currentStage: 'Queued for processing...',
		})
		.returning();

	const webhookUrl = buildFalWebhookUrl('rotation8', job.id);

	try {
		const falResponse = await submitRotation8DirJob({
			imageUrl: inputImageUrl,
			elevation,
			webhookUrl,
		});

		await db
			.update(table.rotationJob)
			.set({ runpodJobId: falResponse.requestId })
			.where(eq(table.rotationJob.id, jobId));
	} catch (err) {
		console.error('fal.ai submission failed:', err);

		await claimJobAndRefund({
			job: table.rotationJob,
			jobId,
			errorMessage: 'Failed to submit job for processing',
			claimableWhen: NOT_TERMINAL,
		});

		error(
			500,
			'Failed to submit job for processing. Tokens have been refunded.',
		);
	}

	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: locals.user.id,
		event: 'rotation_started',
		properties: {
			is_guest: false,
			job_id: job.id,
			token_cost: TOKEN_COST,
			elevation,
			has_prompt: !!prompt,
		},
	});
	await posthog.flush();

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
