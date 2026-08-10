import { error, json } from '@sveltejs/kit';
import { and, eq, isNull, ne, notInArray } from 'drizzle-orm';
import { claimJobAndRefund, NOT_TERMINAL } from '$lib/server/credits';
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
			const isPreprocessorPhase =
				gen.mode === 'restyle' && !gen.controlImageUrl;

			if (isPreprocessorPhase) {
				await handlePreprocessorPhase(gen, params.id);
			} else {
				await handleGenerationStatus(gen, params.id);
			}

			// Re-read after updates
			const refreshedGen = await db.query.conceptArtGeneration.findFirst({
				where: eq(table.conceptArtGeneration.id, params.id),
			});
			if (!refreshedGen) error(404, 'Generation not found');
			gen = refreshedGen;
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
	_paramId: string,
) {
	const method = (gen.controlMethod as 'canny' | 'depth') ?? 'canny';
	const falStatus = await getPreprocessorJobStatus(
		gen.falRequestId as string,
		method,
	);

	if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
		if (gen.status !== 'processing') {
			// Terminal-guarded: `gen.status` is the pre-round-trip copy, so without
			// it a poll that overlaps a cancel would drag the refunded row back to
			// 'processing' — which re-arms NOT_TERMINAL and lets the next poll refund
			// the same job a second time.
			await db
				.update(table.conceptArtGeneration)
				.set({
					status: 'processing',
					currentStage: 'Extracting structure...',
				})
				.where(
					and(
						eq(table.conceptArtGeneration.id, gen.id),
						notInArray(table.conceptArtGeneration.status, [
							'completed',
							'failed',
						]),
					),
				);
		}
	} else if (
		falStatus.status === 'FAILED' ||
		falStatus.status === 'CANCELLED'
	) {
		await refundAndFail(gen, falStatus.error || 'Preprocessor failed');
	} else if (falStatus.status === 'COMPLETED' && falStatus.output?.imageUrl) {
		// Preprocessor done — save control image and submit generation
		const fullPrompt =
			gen.style && STYLE_PREFIXES[gen.style]
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

			// Same guard: a job that was cancelled or failed while the preprocessor
			// was running must not have a fresh fal request id written onto it, or
			// the poller would start tracking phase two of a job the user has
			// already been paid back for.
			await db
				.update(table.conceptArtGeneration)
				.set({
					controlImageUrl: falStatus.output.imageUrl,
					falRequestId: genResponse.requestId,
					currentStage: 'Generating...',
				})
				.where(
					and(
						eq(table.conceptArtGeneration.id, gen.id),
						notInArray(table.conceptArtGeneration.status, [
							'completed',
							'failed',
						]),
					),
				);
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
	_paramId: string,
) {
	const method = (gen.controlMethod as 'canny' | 'depth') ?? 'canny';
	const falStatus =
		gen.mode === 'restyle'
			? await getRestyleJobStatus(gen.falRequestId as string, method)
			: await getConceptArtJobStatus(
					gen.falRequestId as string,
					!!gen.referenceImageUrl,
				);

	if (falStatus.status === 'IN_PROGRESS' || falStatus.status === 'IN_QUEUE') {
		if (gen.status !== 'processing') {
			await db
				.update(table.conceptArtGeneration)
				.set({
					status: 'processing',
					currentStage:
						falStatus.status === 'IN_QUEUE' ? 'Queued...' : 'Processing...',
				})
				.where(
					and(
						eq(table.conceptArtGeneration.id, gen.id),
						notInArray(table.conceptArtGeneration.status, [
							'completed',
							'failed',
						]),
					),
				);
		}
	} else if (
		falStatus.status === 'FAILED' ||
		falStatus.status === 'CANCELLED'
	) {
		await refundAndFail(gen, falStatus.error || 'Job failed on fal.ai');
	} else if (falStatus.status === 'COMPLETED' && falStatus.output) {
		if (falStatus.output.imageUrl && !gen.imageUrl) {
			// `image_url IS NULL` is the real version of the `!gen.imageUrl` read
			// above, so concurrent polls cannot overwrite an image that has already
			// landed, and a row stuck at completed-with-no-image (which is what
			// `needsFalCheck` polls for) is still repairable. `status <> 'failed'`
			// stops a job that was cancelled and refunded mid-round-trip from being
			// handed the asset anyway.
			await db
				.update(table.conceptArtGeneration)
				.set({
					status: 'completed',
					progress: 100,
					currentStage: 'Completed',
					imageUrl: falStatus.output.imageUrl,
					seed:
						falStatus.output.seed &&
						falStatus.output.seed <= Number.MAX_SAFE_INTEGER
							? falStatus.output.seed
							: null,
					completedAt: new Date(),
				})
				.where(
					and(
						eq(table.conceptArtGeneration.id, gen.id),
						isNull(table.conceptArtGeneration.imageUrl),
						ne(table.conceptArtGeneration.status, 'failed'),
					),
				);
		}
	}
}

/**
 * Fails the generation and credits its cost back in a single statement.
 *
 * `gen` is a copy read at the top of the request, before a fal.ai round trip
 * that takes as long as fal.ai takes, so nothing about it can gate the money:
 * every one of the poll loop's in-flight requests holds the same pre-failure
 * copy, and the cancel endpoint and the fal webhook race it too. The refund
 * therefore hangs off winning the `-> failed` transition, not off a status read
 * — five concurrent polls of one job produce exactly one refund, and a poll
 * that overlaps a cancel credits nothing on top of the cancel's own claim.
 *
 * A null claim means the row was already terminal: someone else has paid this
 * job back (or delivered it). That is the normal outcome of a race, not an
 * error, so it is logged and swallowed — the handler re-reads the row
 * afterwards and reports whatever the winner wrote.
 */
async function refundAndFail(
	gen: typeof table.conceptArtGeneration.$inferSelect,
	errorMessage: string,
) {
	const claim = await claimJobAndRefund({
		job: table.conceptArtGeneration,
		jobId: gen.id,
		errorMessage,
		claimableWhen: NOT_TERMINAL,
	});

	if (!claim) {
		console.log(
			`[concept-art/status] ${gen.id} was already terminal — no refund`,
		);
	}

	return claim;
}
