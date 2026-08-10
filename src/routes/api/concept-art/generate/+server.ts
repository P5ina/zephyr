import { error, json } from '@sveltejs/kit';
import { put } from '@vercel/blob';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '$env/dynamic/private';
import { PRICING } from '$lib/pricing';
import {
	chargeCredits,
	claimJobAndRefund,
	NOT_TERMINAL,
} from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { submitConceptArtJob, submitPreprocessorJob } from '$lib/server/fal';
import { buildFalWebhookUrl } from '$lib/server/fal-webhook';
import { getPostHogClient } from '$lib/server/posthog';
import type { RequestHandler } from './$types';

const VALID_IMAGE_SIZES = [
	'landscape_16_9',
	'landscape_4_3',
	'square_hd',
	'portrait_4_3',
	'portrait_16_9',
];

const STYLE_PREFIXES: Record<string, string> = {
	painterly: 'painterly concept art style, ',
	anime: 'anime concept art style, ',
	realistic: 'photorealistic concept art, ',
	'pixel-art': 'pixel art concept art, ',
	watercolor: 'watercolor concept art style, ',
	'sci-fi': 'sci-fi concept art, futuristic, ',
	fantasy: 'fantasy concept art, epic, ',
	'ink-drawing': 'ink drawing concept art, detailed linework, ',
};

async function uploadImage(file: File, userId: string): Promise<string> {
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

	const blob = await put(`concept-art/${userId}/${nanoid()}.png`, file, {
		access: 'public',
		contentType: file.type,
		token: env.BLOB_READ_WRITE_TOKEN,
	});
	return blob.url;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const contentType = request.headers.get('content-type') || '';

	let prompt: string | undefined;
	let imageSize: string = 'square_hd';
	let style: string | null = null;
	let seed: number | undefined;
	let referenceImageUrl: string | null = null;
	let referenceStrength: number | null = null;

	let mode: string = 'standard';
	let compositionImageUrl: string | null = null;
	let controlMethod: string | null = null;
	let controlStrength: number | null = null;

	if (contentType.includes('multipart/form-data')) {
		const formData = await request.formData();

		prompt = (formData.get('prompt') as string | null) || undefined;
		const imageSizeField = formData.get('imageSize') as string | null;
		if (imageSizeField) imageSize = imageSizeField;
		const styleField = formData.get('style') as string | null;
		if (styleField) style = styleField;
		const seedField = formData.get('seed') as string | null;
		if (seedField) {
			const parsed = parseInt(seedField, 10);
			if (!Number.isNaN(parsed)) seed = parsed;
		}

		const modeField = formData.get('mode') as string | null;
		if (modeField === 'restyle') {
			mode = 'restyle';

			// Composition image: uploaded to Blob client-side (URL), with a
			// legacy fallback for a raw file in the multipart body.
			const compositionUrlField = formData.get('compositionImageUrl') as
				string | null;
			const compositionFile = formData.get('compositionImage') as File | null;
			if (compositionUrlField) {
				compositionImageUrl = compositionUrlField;
			} else if (compositionFile && compositionFile.size > 0) {
				compositionImageUrl = await uploadImage(
					compositionFile,
					locals.user.id,
				);
			} else {
				error(400, 'Composition image is required for restyle mode');
			}

			// Control method
			const controlMethodField = formData.get('controlMethod') as string | null;
			if (
				controlMethodField &&
				['canny', 'depth'].includes(controlMethodField)
			) {
				controlMethod = controlMethodField;
			} else {
				controlMethod = 'canny';
			}

			// Control strength (0-100)
			const controlStrengthField = formData.get('controlStrength') as
				string | null;
			if (controlStrengthField) {
				const parsed = parseInt(controlStrengthField, 10);
				if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
					controlStrength = parsed;
				}
			}
			if (controlStrength === null) controlStrength = 70;
		} else {
			// Standard mode — handle reference image
			const file = formData.get('image') as File | null;
			const imageUrlField = formData.get('imageUrl') as string | null;
			const strengthField = formData.get('strength') as string | null;

			if (imageUrlField) {
				referenceImageUrl = imageUrlField;
			} else if (file && file.size > 0) {
				referenceImageUrl = await uploadImage(file, locals.user.id);
			}

			if (strengthField) {
				const parsed = parseInt(strengthField, 10);
				if (!Number.isNaN(parsed) && parsed >= 0 && parsed <= 100) {
					referenceStrength = parsed;
				}
			}
		}
	} else {
		const body = await request.json();
		prompt = body.prompt;
		if (body.imageSize) imageSize = body.imageSize;
		if (body.style) style = body.style;
		if (body.seed) seed = body.seed;
	}

	if (!prompt?.trim()) {
		error(400, 'Prompt is required');
	}

	if (prompt.length > 2000) {
		error(400, 'Prompt must be 2000 characters or less');
	}

	if (!VALID_IMAGE_SIZES.includes(imageSize)) {
		error(400, 'Invalid image size');
	}

	if (style && !STYLE_PREFIXES[style]) {
		error(400, 'Invalid style preset');
	}

	// Restyle runs an extra preprocessor pass, so it is priced higher. The charge
	// has to use the cost this request actually resolved to, not the plain one.
	const TOKEN_COST =
		mode === 'restyle'
			? PRICING.tokenCosts.conceptArtRestyle
			: PRICING.tokenCosts.conceptArt;

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

	// Taken from the charge, not recomputed from the snapshot: the job row
	// records this split, and a later refund pays each bucket back from it.
	const bonusDeduct = charge.bonusCharged;

	const genId = nanoid();

	// Build the full prompt with style prefix
	const fullPrompt =
		style && STYLE_PREFIXES[style]
			? STYLE_PREFIXES[style] + prompt.trim()
			: prompt.trim();

	await db.insert(table.conceptArtGeneration).values({
		id: genId,
		userId: locals.user.id,
		prompt: prompt.trim(),
		style,
		imageSize,
		referenceImageUrl,
		referenceStrength,
		mode,
		compositionImageUrl,
		controlMethod,
		controlStrength,
		status: 'pending',
		tokenCost: TOKEN_COST,
		bonusTokenCost: bonusDeduct,
		currentStage:
			mode === 'restyle'
				? 'Extracting structure...'
				: 'Queued for processing...',
	});

	// Submit to fal.ai
	const isRestyle = mode === 'restyle';
	const webhookUrl = buildFalWebhookUrl(
		isRestyle ? 'preprocessor' : 'conceptart',
		genId,
	);
	try {
		let falResponse: { requestId: string };

		if (isRestyle) {
			// Two-phase: preprocessor → generation.
			// Submit the preprocessor job to the queue and return immediately.
			// The status endpoint drives phase transitions.
			falResponse = await submitPreprocessorJob({
				imageUrl: compositionImageUrl as string,
				method: controlMethod as 'canny' | 'depth',
				webhookUrl,
			});
		} else {
			falResponse = await submitConceptArtJob({
				prompt: fullPrompt,
				imageSize,
				seed,
				imageUrl: referenceImageUrl ?? undefined,
				strength:
					referenceStrength != null ? referenceStrength / 100 : undefined,
				webhookUrl,
			});
		}

		await db
			.update(table.conceptArtGeneration)
			.set({ falRequestId: falResponse.requestId })
			.where(eq(table.conceptArtGeneration.id, genId));
	} catch (err: unknown) {
		const body = (err as { body?: unknown })?.body;
		console.error('fal.ai submission failed:', err);
		if (body)
			console.error('fal.ai error body:', JSON.stringify(body, null, 2));

		// Mark failed and refund in one statement, so the credit is gated by the
		// job's state transition rather than by what this handler last read.
		await claimJobAndRefund({
			job: table.conceptArtGeneration,
			jobId: genId,
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
		event: 'concept_art_generation_started',
		properties: {
			mode,
			style,
			image_size: imageSize,
			token_cost: TOKEN_COST,
			has_reference_image: !!referenceImageUrl,
		},
	});
	await posthog.flush();

	// Reported from what the charge actually left behind. Deriving these from
	// locals.user would repeat the snapshot's arithmetic and could tell a client
	// it still has credit while the row says otherwise.
	return json({
		id: genId,
		status: 'pending',
		tokensRemaining: charge.tokensAfter,
		bonusTokensRemaining: charge.bonusTokensAfter,
	});
};
