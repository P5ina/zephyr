import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelConceptArtJob, cancelRestyleJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const gen = await db.query.conceptArtGeneration.findFirst({
		where: and(
			eq(table.conceptArtGeneration.id, params.id),
			eq(table.conceptArtGeneration.userId, locals.user.id),
		),
	});

	if (!gen) {
		error(404, 'Generation not found');
	}

	if (gen.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	if (gen.status === 'completed' && gen.imageUrl) {
		error(400, 'Cannot cancel a completed generation with results');
	}

	// Cancel the job on fal.ai if it has a request ID
	if (gen.falRequestId) {
		try {
			if (gen.mode === 'restyle') {
				await cancelRestyleJob(
					gen.falRequestId,
					(gen.controlMethod as 'canny' | 'depth') ?? 'canny',
				);
			} else {
				await cancelConceptArtJob(gen.falRequestId, !!gen.referenceImageUrl);
			}
		} catch (e) {
			console.error('Failed to cancel fal.ai job:', e);
		}
	}

	await db
		.update(table.conceptArtGeneration)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.conceptArtGeneration.id, gen.id));

	// Refund tokens
	const regularTokens = gen.tokenCost - gen.bonusTokenCost;
	await db
		.update(table.user)
		.set({
			tokens: sql`${table.user.tokens} + ${regularTokens}`,
			bonusTokens: sql`${table.user.bonusTokens} + ${gen.bonusTokenCost}`,
		})
		.where(eq(table.user.id, gen.userId));

	return json({
		success: true,
		tokensRefunded: gen.tokenCost,
		regularTokensRefunded: regularTokens,
		bonusTokensRefunded: gen.bonusTokenCost,
	});
};
