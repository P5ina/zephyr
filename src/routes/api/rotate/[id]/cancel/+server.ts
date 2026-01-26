import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
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

	if (rotation.status === 'completed' || rotation.status === 'failed') {
		error(400, 'Cannot cancel a completed or failed generation');
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
