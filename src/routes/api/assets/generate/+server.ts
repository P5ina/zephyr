import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import { chargeCredits, claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitSpriteJob } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import * as guestAuth from '$lib/server/guest-auth';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

const TOKEN_COSTS: Record<string, number> = {
	sprite: PRICING.tokenCosts.sprite,
	texture: PRICING.tokenCosts.texture,
};

const SPRITE_BASE_SUFFIX =
	', game asset, centered, single object, white background';

const SPRITE_STYLE_PREFIXES: Record<string, string> = {
	'hand-painted': 'hand-painted 2D art, stylized, painted texture, ',
	anime: 'anime style, cel-shaded, clean lines, ',
	cartoon: 'cartoon style, bold outlines, vibrant colors, ',
	realistic:
		'realistic 3D rendered, high detail, PBR shading, studio lighting, ',
	vector: 'vector art, flat colors, clean shapes, minimal shading, SVG style, ',
	outline: 'black outline drawing, lineart, clean strokes, minimal fill, ',
};

const SPRITE_DEFAULT_PREFIX = '';

function buildSpritePrompt(userPrompt: string, style?: string): string {
	const prefix =
		style && SPRITE_STYLE_PREFIXES[style]
			? SPRITE_STYLE_PREFIXES[style]
			: SPRITE_DEFAULT_PREFIX;
	return prefix + userPrompt + SPRITE_BASE_SUFFIX;
}

interface AssetGenerateRequest {
	assetType?: 'sprite' | 'texture';
	prompt: string;
	style?: string;
	width?: number;
	height?: number;
	seed?: number;
}

export const POST: RequestHandler = async ({
	request,
	locals,
	getClientAddress,
}) => {
	const body: AssetGenerateRequest = await request.json();

	if (!body.prompt?.trim()) {
		error(400, 'Prompt is required');
	}

	if (body.prompt.length > 2000) {
		error(400, 'Prompt must be 2000 characters or less');
	}

	const assetType = body.assetType || 'sprite';
	if (!TOKEN_COSTS[assetType]) {
		error(400, 'Invalid asset type');
	}

	// Guest flow
	if (!locals.user) {
		// Guests can only generate sprites
		if (!GUEST_CONFIG.allowedAssetTypes.includes(assetType as 'sprite')) {
			error(403, 'Sign up to generate textures');
		}

		// Get or create guest session
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
			// Cookie will be set in response
		}

		// Check generation limit
		if (!guestAuth.canGuestGenerate(guestSession)) {
			error(429, 'Free generation limit reached. Sign up to continue.');
		}

		// Create asset record for guest
		const assetId = nanoid();
		const assetVisibleId = nanoid(10);
		const width = body.width || 512;
		const height = body.height || 512;

		const [asset] = await db
			.insert(table.assetGeneration)
			.values({
				id: assetId,
				visibleId: assetVisibleId,
				guestSessionId: guestSession.id,
				assetType,
				prompt: body.prompt,
				width,
				height,
				status: 'pending',
				tokenCost: 0,
				bonusTokenCost: 0,
				currentStage: 'Queued for processing...',
			})
			.returning();

		// Submit to fal.ai
		const generationPrompt = buildSpritePrompt(body.prompt, body.style);
		const webhookUrl = buildFalWebhookUrl('sprite', asset.id);
		console.log(
			'[sprite] Final prompt:',
			generationPrompt,
			'| style:',
			body.style,
		);
		try {
			const falResponse = await submitSpriteJob({
				prompt: generationPrompt,
				width,
				height,
				seed: body.seed,
				webhookUrl,
			});

			await db
				.update(table.assetGeneration)
				.set({ runpodJobId: falResponse.requestId })
				.where(eq(table.assetGeneration.id, assetId));
		} catch (err) {
			console.error('fal.ai submission failed:', err);

			await db
				.update(table.assetGeneration)
				.set({
					status: 'failed',
					errorMessage: 'Failed to submit job for processing',
				})
				.where(eq(table.assetGeneration.id, assetId));

			error(500, 'Failed to submit job for processing.');
		}

		// Increment guest usage
		await guestAuth.incrementGuestUsage(guestSession.id);
		const generationsRemaining =
			guestAuth.getGuestRemainingGenerations(guestSession) - 1;

		const posthog = getPostHogClient();
		posthog.capture({
			distinctId: `guest-${guestSession.id}`,
			event: 'sprite_generation_started',
			properties: {
				is_guest: true,
				asset_type: assetType,
				style: body.style,
				width: body.width || 512,
				height: body.height || 512,
			},
		});
		await posthog.flush();

		return json(
			{
				asset,
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
	const cost = TOKEN_COSTS[assetType];

	// The charge is the affordability check. Testing locals.user.tokens first
	// would not help: it is a snapshot the auth hook loaded before the request
	// began, so every concurrent request holds the same stale copy and they all
	// pass. Here the balance predicate lives in the WHERE of the write, so only
	// one of them can succeed.
	const charge = await chargeCredits({ userId: locals.user.id, cost });

	if (!charge) {
		error(402, `Not enough tokens. Required: ${cost}`);
	}

	// Taken from what was actually charged, not from the snapshot: the job row
	// records the split, and a later refund restores exactly those buckets.
	const bonusDeduct = charge.bonusCharged;

	// Create asset record with 'pending' status - worker will pick it up
	const assetId = nanoid();
	const assetVisibleId = nanoid(10);
	const width = body.width || 512;
	const height = body.height || 512;

	const [asset] = await db
		.insert(table.assetGeneration)
		.values({
			id: assetId,
			visibleId: assetVisibleId,
			userId: locals.user.id,
			assetType,
			prompt: body.prompt,
			width,
			height,
			status: 'pending',
			tokenCost: cost,
			bonusTokenCost: bonusDeduct,
			currentStage: 'Queued for processing...',
		})
		.returning();

	// Submit to fal.ai for processing
	const authGenerationPrompt = buildSpritePrompt(body.prompt, body.style);
	const webhookUrl = buildFalWebhookUrl('sprite', asset.id);
	console.log(
		'[sprite] Final prompt:',
		authGenerationPrompt,
		'| style:',
		body.style,
	);
	try {
		const falResponse = await submitSpriteJob({
			prompt: authGenerationPrompt,
			width,
			height,
			seed: body.seed,
			webhookUrl,
		});

		// Store fal.ai request ID for status polling
		await db
			.update(table.assetGeneration)
			.set({ runpodJobId: falResponse.requestId })
			.where(eq(table.assetGeneration.id, assetId));
	} catch (err) {
		// fal.ai submission failed - refund tokens and mark as failed
		console.error('fal.ai submission failed:', err);

		await claimJobAndRefund({
			job: table.assetGeneration,
			jobId: assetId,
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
	const tokensRemaining = charge.tokensAfter;
	const bonusRemaining = charge.bonusTokensAfter;

	const posthog = getPostHogClient();
	posthog.capture({
		distinctId: locals.user.id,
		event: 'sprite_generation_started',
		properties: {
			is_guest: false,
			asset_type: assetType,
			style: body.style,
			token_cost: cost,
			width: body.width || 512,
			height: body.height || 512,
		},
	});
	await posthog.flush();

	return json({
		asset,
		isGuest: false,
		tokensUsed: cost,
		tokensRemaining,
		bonusTokensRemaining: bonusRemaining,
		totalTokensRemaining: tokensRemaining + bonusRemaining,
	});
};
