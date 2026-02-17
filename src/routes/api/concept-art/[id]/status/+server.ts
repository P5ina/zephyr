import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import {
	getConceptArtJobStatus,
	getPreprocessorJobStatus,
	getRestyleJobStatus,
	submitRestyleGeneration,
} from '$lib/server/fal';
import type { RequestHandler } from './$types';

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

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	let gen = await db.query.conceptArtGeneration.findFirst({
		where: and(
			eq(table.conceptArtGeneration.id, params.id),
			eq(table.conceptArtGeneration.userId, locals.user.id),
		),
	});

	if (!gen) {
		error(404, 'Generation not found');
	}

	// Check fal.ai status if we have a request ID and need to sync state
	const needsFalCheck =
		gen.falRequestId &&
		(gen.status === 'pending' ||
			gen.status === 'processing' ||
			(gen.status === 'completed' && !gen.imageUrl));

	if (needsFalCheck) {
		try {
			// Restyle two-phase: preprocessor (phase 1) → generation (phase 2)
			// Phase is determined by whether controlImageUrl has been set yet
			const isPreprocessorPhase = gen.mode === 'restyle' && !gen.controlImageUrl;

			if (isPreprocessorPhase) {
				await handlePreprocessorPhase(gen, params.id);
			} else {
				await handleGenerationStatus(gen, params.id);
			}

			// Re-read after updates
			gen = (await db.query.conceptArtGeneration.findFirst({
				where: eq(table.conceptArtGeneration.id, params.id),
			}))!;
		} catch (e) {
			console.error('Failed to check fal.ai status:', e);
		}
	}

	const response: Record<string, unknown> = {
		id: gen.id,
		status: gen.status,
	};

	if (gen.controlImageUrl) {
		response.controlImageUrl = gen.controlImageUrl;
	}

	if (gen.status === 'pending') {
		response.statusMessage = gen.currentStage || 'Queued for processing...';
		response.progress = 0;
	}

	if (gen.status === 'processing') {
		response.progress = gen.progress;
		response.statusMessage = gen.currentStage || 'Processing...';
	}

	if (gen.status === 'completed') {
		response.progress = 100;
		response.imageUrl = gen.imageUrl;
	}

	if (gen.status === 'failed') {
		response.error = gen.errorMessage;
	}

	return json(response);
};

/**
 * Phase 1: Poll the preprocessor job. When done, save the control image
 * and submit the generation job (transitioning to phase 2).
 */
async function handlePreprocessorPhase(
	gen: typeof table.conceptArtGeneration.$inferSelect,
	paramId: string,
) {
	const method = (gen.controlMethod as 'canny' | 'depth') ?? 'canny';
	const falStatus = await getPreprocessorJobStatus(gen.falRequestId!, method);

	if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
		if (gen.status !== 'processing') {
			await db
				.update(table.conceptArtGeneration)
				.set({
					status: 'processing',
					currentStage: 'Extracting structure...',
				})
				.where(eq(table.conceptArtGeneration.id, gen.id));
		}
	} else if (falStatus.status === 'FAILED' || falStatus.status === 'CANCELLED') {
		await refundAndFail(gen, falStatus.error || 'Preprocessor failed');
	} else if (falStatus.status === 'COMPLETED' && falStatus.output?.imageUrl) {
		// Preprocessor done — save control image and submit generation
		const fullPrompt = gen.style && STYLE_PREFIXES[gen.style]
			? STYLE_PREFIXES[gen.style] + gen.prompt
			: gen.prompt;

		try {
			const genResponse = await submitRestyleGeneration({
				prompt: fullPrompt,
				imageSize: gen.imageSize,
				controlImageUrl: falStatus.output.imageUrl,
				controlMethod: method,
				controlStrength: (gen.controlStrength ?? 70) / 100,
				seed: gen.seed ?? undefined,
			});

			await db
				.update(table.conceptArtGeneration)
				.set({
					controlImageUrl: falStatus.output.imageUrl,
					falRequestId: genResponse.requestId,
					currentStage: 'Generating...',
				})
				.where(eq(table.conceptArtGeneration.id, gen.id));
		} catch (e) {
			console.error(`Failed to submit ${gen.mode} generation:`, e);
			await refundAndFail(gen, 'Failed to submit generation job');
		}
	}
}

/**
 * Standard generation status check (phase 2 for restyle, or the only phase for other modes).
 */
async function handleGenerationStatus(
	gen: typeof table.conceptArtGeneration.$inferSelect,
	paramId: string,
) {
	const method = (gen.controlMethod as 'canny' | 'depth') ?? 'canny';
	const falStatus = gen.mode === 'restyle'
		? await getRestyleJobStatus(gen.falRequestId!, method)
		: await getConceptArtJobStatus(gen.falRequestId!, !!gen.referenceImageUrl);

	if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
		if (gen.status !== 'processing') {
			await db
				.update(table.conceptArtGeneration)
				.set({
					status: 'processing',
					currentStage: falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
				})
				.where(eq(table.conceptArtGeneration.id, gen.id));
		}
	} else if (falStatus.status === 'FAILED' || falStatus.status === 'CANCELLED') {
		await refundAndFail(gen, falStatus.error || 'Job failed on fal.ai');
	} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
		if (falStatus.output.imageUrl && !gen.imageUrl) {
			await db
				.update(table.conceptArtGeneration)
				.set({
					status: 'completed',
					progress: 100,
					currentStage: 'Completed',
					imageUrl: falStatus.output.imageUrl,
					seed: falStatus.output.seed && falStatus.output.seed <= 9223372036854775807 ? falStatus.output.seed : null,
					completedAt: new Date(),
				})
				.where(eq(table.conceptArtGeneration.id, gen.id));
		}
	}
}

async function refundAndFail(
	gen: typeof table.conceptArtGeneration.$inferSelect,
	errorMessage: string,
) {
	if (gen.status !== 'failed') {
		const regularTokens = gen.tokenCost - gen.bonusTokenCost;
		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${regularTokens}`,
				bonusTokens: sql`${table.user.bonusTokens} + ${gen.bonusTokenCost}`,
			})
			.where(eq(table.user.id, gen.userId));
	}

	await db
		.update(table.conceptArtGeneration)
		.set({
			status: 'failed',
			errorMessage,
		})
		.where(eq(table.conceptArtGeneration.id, gen.id));
}
