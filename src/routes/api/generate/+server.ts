import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { generateImage } from '$lib/server/fal';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { nanoid } from 'nanoid';
import { inArray, eq, sql } from 'drizzle-orm';

interface GenerateRequest {
	prompt: string;
	width?: number;
	height?: number;
	numInferenceSteps?: number;
	numImages?: number;
	seed?: number;
	loras?: Array<{ id: string; scale: number }>;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: GenerateRequest = await request.json();

	if (!body.prompt || body.prompt.trim().length === 0) {
		error(400, 'Prompt is required');
	}

	if (body.prompt.length > 2000) {
		error(400, 'Prompt must be 2000 characters or less');
	}

	if (body.loras && body.loras.length > 3) {
		error(400, 'Maximum 3 LoRAs allowed');
	}

	const numImages = body.numImages ?? 1;
	const tokensRequired = numImages;

	if (locals.user.tokens < tokensRequired) {
		error(402, `Not enough tokens. Required: ${tokensRequired}, available: ${locals.user.tokens}`);
	}

	let lorasForGeneration: Array<{ path: string; scale: number }> | undefined;
	const loraIds: string[] = [];

	if (body.loras && body.loras.length > 0) {
		const loraRecords = await db.query.lora.findMany({
			where: inArray(
				table.lora.id,
				body.loras.map((l) => l.id)
			),
		});

		const loraMap = new Map(loraRecords.map((l) => [l.id, l]));

		lorasForGeneration = body.loras
			.map((l) => {
				const lora = loraMap.get(l.id);
				if (lora) {
					loraIds.push(lora.id);
					return { path: lora.falUrl, scale: l.scale };
				}
				return null;
			})
			.filter((l): l is { path: string; scale: number } => l !== null);
	}

	let result;
	try {
		result = await generateImage({
			prompt: body.prompt,
			width: body.width,
			height: body.height,
			numInferenceSteps: body.numInferenceSteps,
			numImages: body.numImages,
			seed: body.seed,
			loras: lorasForGeneration,
			enableSafetyChecker: !locals.user.nsfwEnabled,
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Generation failed';
		error(422, message);
	}

	const generations = await Promise.all(
		result.images.map(async (image) => {
			const [generation] = await db
				.insert(table.generation)
				.values({
					id: nanoid(),
					visibleId: nanoid(10),
					prompt: body.prompt,
					imageUrl: image.url,
					loraIds,
					seed: result.seed,
					width: image.width,
					height: image.height,
					userId: locals.user!.id,
				})
				.returning();
			return generation;
		})
	);

	// Deduct tokens after successful generation
	const tokensUsed = result.images.length;
	await db
		.update(table.user)
		.set({ tokens: sql`${table.user.tokens} - ${tokensUsed}` })
		.where(eq(table.user.id, locals.user.id));

	return json({
		generations,
		seed: result.seed,
		tokensUsed,
		tokensRemaining: locals.user.tokens - tokensUsed,
	});
};
