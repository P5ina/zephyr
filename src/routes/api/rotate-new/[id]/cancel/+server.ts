import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelRotationJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const rotation = await db.query.rotationJobNew.findFirst({
		where: and(
			eq(table.rotationJobNew.id, params.id),
			eq(table.rotationJobNew.userId, locals.user.id),
		),
	});

	if (!rotation) {
		error(404, 'Rotation job not found');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	const hasResults = rotation.rotationFront || rotation.rotationBack;

	if (rotation.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	if (rotation.status === 'completed' && hasResults) {
		error(400, 'Cannot cancel a completed generation with results');
	}

	// Cancel the job on fal.ai if it has a request ID
	if (rotation.falRequestId) {
		try {
			await cancelRotationJob(rotation.falRequestId);
		} catch (e) {
			console.error('Failed to cancel fal.ai job:', e);
		}
	}

	await db
		.update(table.rotationJobNew)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.rotationJobNew.id, rotation.id));

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
