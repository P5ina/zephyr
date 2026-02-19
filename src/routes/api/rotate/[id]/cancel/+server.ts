import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelRotation8DirJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	let ownershipCondition;
	const isGuest = !locals.user;

	if (locals.user) {
		ownershipCondition = eq(table.rotationJob.userId, locals.user.id);
	} else if (locals.guestSession) {
		ownershipCondition = eq(table.rotationJob.guestSessionId, locals.guestSession.id);
	} else {
		error(401, 'Unauthorized');
	}

	const rotation = await db.query.rotationJob.findFirst({
		where: and(
			eq(table.rotationJob.id, params.id),
			ownershipCondition,
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

	// Cancel the job on fal.ai if it has a request ID
	if (rotation.runpodJobId) {
		try {
			await cancelRotation8DirJob(rotation.runpodJobId);
		} catch (e) {
			console.error('Failed to cancel fal.ai job:', e);
		}
	}

	await db
		.update(table.rotationJob)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.rotationJob.id, rotation.id));

	// Only refund tokens for authenticated users (guests have tokenCost: 0)
	if (!isGuest && rotation.userId) {
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
	}

	return json({
		success: true,
		tokensRefunded: 0,
		regularTokensRefunded: 0,
		bonusTokensRefunded: 0,
	});
};
