import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { startTraining, uploadToFalStorage } from '$lib/server/fal';
import { createTrainingZip } from '$lib/server/zip';
import type { RequestHandler } from './$types';

interface StartTrainingRequest {
	trainingType?: 'content' | 'style' | 'balanced';
	steps?: number;
	triggerWord?: string;
}

// Calculate tokens required for training
function calculateTokensRequired(steps: number): number {
	// 50 tokens per 1000 steps (5 tokens per 100 steps)
	return Math.ceil((steps / 1000) * 50);
}

// POST: Start training
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: StartTrainingRequest = await request.json();

	const trainingType = body.trainingType || 'balanced';
	const steps = body.steps || 1000;
	const triggerWord = body.triggerWord || '';

	// Validate steps (min 100, max 10000)
	if (steps < 100 || steps > 10000) {
		error(400, 'Steps must be between 100 and 10000');
	}

	const job = await db.query.trainingJob.findFirst({
		where: and(
			eq(table.trainingJob.id, params.jobId),
			eq(table.trainingJob.userId, locals.user.id),
		),
	});

	if (!job) {
		error(404, 'Training job not found');
	}

	// Allow starting from 'ready' or retrying from 'failed'
	if (job.status !== 'ready' && job.status !== 'failed') {
		error(400, 'Training job is not ready. Please caption images first.');
	}

	const images = await db.query.trainingImage.findMany({
		where: eq(table.trainingImage.trainingJobId, job.id),
	});

	if (images.length < 5) {
		error(400, 'At least 5 images are required for training');
	}

	// Check if all images have captions
	const uncaptioned = images.filter((img) => !img.userCaption);
	if (uncaptioned.length > 0) {
		error(400, `${uncaptioned.length} images are missing captions`);
	}

	// Calculate and check tokens
	const tokensRequired = calculateTokensRequired(steps);
	const totalTokens = locals.user.tokens + locals.user.bonusTokens;

	if (totalTokens < tokensRequired) {
		error(
			402,
			`Not enough tokens. Required: ${tokensRequired}, available: ${totalTokens}`,
		);
	}

	// Deduct tokens (bonus first, then regular)
	const bonusDeduct = Math.min(locals.user.bonusTokens, tokensRequired);
	const regularDeduct = tokensRequired - bonusDeduct;

	// Deduct tokens first
	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	try {
		// Create training zip
		const zipBlob = await createTrainingZip(
			images.map((img) => ({
				url: img.imageUrl,
				filename: img.filename,
				caption: img.userCaption!,
			})),
		);

		// Upload zip to fal.ai storage
		const zipFile = new File([zipBlob], 'training_data.zip', {
			type: 'application/zip',
		});
		console.log('[training] Uploading zip, size:', zipBlob.size);
		const zipUrl = await uploadToFalStorage(zipFile);
		console.log('[training] Zip uploaded to:', zipUrl);

		// Start training
		console.log('[training] Starting training with steps:', steps, 'triggerWord:', triggerWord);
		const { request_id } = await startTraining(zipUrl, steps, triggerWord);
		console.log('[training] Got request_id:', request_id);

		// Only set status to 'training' AFTER successful submission
		await db
			.update(table.trainingJob)
			.set({
				status: 'training',
				trainingType,
				steps,
				progress: 0,
				falRequestId: request_id,
				errorMessage: null, // Clear any previous error
			})
			.where(eq(table.trainingJob.id, job.id));

		const tokensRemaining = locals.user.tokens - regularDeduct;
		const bonusRemaining = locals.user.bonusTokens - bonusDeduct;

		return json({
			success: true,
			requestId: request_id,
			tokensUsed: tokensRequired,
			tokensRemaining,
			bonusTokensRemaining: bonusRemaining,
		});
	} catch (err) {
		// Refund tokens on failure
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusDeduct}`,
				tokens: sql`${table.user.tokens} + ${regularDeduct}`,
			})
			.where(eq(table.user.id, locals.user.id));

		// Keep job in 'ready' status so user can retry (don't change status)
		// Just store the error message for reference
		await db
			.update(table.trainingJob)
			.set({
				errorMessage: err instanceof Error ? err.message : 'Training failed',
			})
			.where(eq(table.trainingJob.id, job.id));

		const message = err instanceof Error ? err.message : 'Training failed';
		error(500, message);
	}
};
