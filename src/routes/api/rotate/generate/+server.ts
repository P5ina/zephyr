import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { put } from '@vercel/blob';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

const TOKEN_COST = 8;

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const contentType = request.headers.get('content-type') || '';

	let inputImageUrl: string | undefined;
	let prompt: string | undefined;
	let elevation: number = 20;

	if (contentType.includes('multipart/form-data')) {
		// Handle file upload
		const formData = await request.formData();
		const file = formData.get('image') as File | null;
		const imageUrl = formData.get('imageUrl') as string | null;
		prompt = formData.get('prompt') as string | null || undefined;
		const elevationStr = formData.get('elevation') as string | null;
		if (elevationStr) {
			const parsed = parseInt(elevationStr, 10);
			if (!isNaN(parsed) && parsed >= -90 && parsed <= 90) {
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
				error(500, 'Image upload not configured. Please use an existing sprite or contact support.');
			}

			const blob = await put(`rotations/${locals.user.id}/${nanoid()}.png`, file, {
				access: 'public',
				contentType: file.type,
				token: env.BLOB_READ_WRITE_TOKEN,
			});
			inputImageUrl = blob.url;
		}
	} else {
		// Handle JSON body
		const body = await request.json();
		inputImageUrl = body.imageUrl as string | undefined;
		prompt = body.prompt as string | undefined;
		if (typeof body.elevation === 'number' && body.elevation >= -90 && body.elevation <= 90) {
			elevation = body.elevation;
		}
	}

	if (!inputImageUrl) {
		error(400, 'Image is required. Upload an image or provide an image URL.');
	}

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

	// Create rotation job record with 'pending' status
	// The worker running on Vast.ai will pick this up and process it
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

	return json({
		id: job.id,
		job,
		status: 'pending',
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
}
