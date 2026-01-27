import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelJob } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const rotation = await db.query.rotationJob.findFirst({
		where: and(
			eq(table.rotationJob.id, params.id),
			eq(table.rotationJob.userId, locals.user.id),
		),
	});

	if (!rotation) {
		error(404, 'Rotation job not found');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	const hasResults = rotation.rotationN || rotation.rotationS;

	if (rotation.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	if (rotation.status === 'completed' && hasResults) {
		error(400, 'Cannot cancel a completed generation with results');
	}

	// Cancel the job on RunPod if it has a RunPod job ID
	if (rotation.runpodJobId) {
		try {
			await cancelJob(rotation.runpodJobId);
		} catch (e) {
			console.error('Failed to cancel RunPod job:', e);
		}
	}

	await db
		.update(table.rotationJob)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.rotationJob.id, rotation.id));

	// Refund both regular and bonus tokens correctly
	const regularTokens = rotation.tokenCost - rotation.bonusTokenCost;
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${regularTokens}`,
			bonusTokens: sql`${table.user.bonusTokens} + ${rotation.bonusTokenCost}`,
		})
		.where(eq(table.user.id, rotation.userId));

	return json({
		success: true,
		tokensRefunded: rotation.tokenCost,
		regularTokensRefunded: regularTokens,
		bonusTokensRefunded: rotation.bonusTokenCost,
	});
};
