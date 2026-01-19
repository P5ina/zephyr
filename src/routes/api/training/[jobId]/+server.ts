import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelTraining } from '$lib/server/fal';
import type { RequestHandler } from './$types';

// Calculate tokens for training (must match start endpoint)
function calculateTokensForSteps(steps: number): number {
	return Math.ceil((steps / 1000) * 50);
}

// GET: Get training job with images
export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
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

	const images = await db.query.trainingImage.findMany({
		where: eq(table.trainingImage.trainingJobId, job.id),
	});

	return json({ job, images });
};

// DELETE: Delete training job
export const DELETE: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
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

	let tokensRefunded = 0;

	// Cancel on fal.ai if there's an active request
	if (job.falRequestId && job.status === 'training') {
		await cancelTraining(job.falRequestId);
	}

	// Refund tokens if job was in training status (tokens were deducted but not completed)
	if (job.status === 'training' && job.steps) {
		tokensRefunded = calculateTokensForSteps(job.steps);

		// Refund to bonus tokens (we can't know the original split)
		await db
			.update(table.user)
			.set({
				bonusTokens: sql`${table.user.bonusTokens} + ${tokensRefunded}`,
			})
			.where(eq(table.user.id, locals.user.id));
	}

	// Delete the job
	await db
		.delete(table.trainingJob)
		.where(eq(table.trainingJob.id, params.jobId));

	return json({ success: true, tokensRefunded });
};
