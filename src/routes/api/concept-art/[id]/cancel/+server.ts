import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
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

	// The checks above are for reporting a useful error. They cannot gate the
	// refund: they ran against a row read before the fal.ai round trip, and a
	// concurrent request would pass them too. The claim below re-states them as
	// the WHERE of the write, so exactly one caller can ever win.
	//
	// A restyle mid-flight through phase two already holds control_image_url,
	// but that never made a generation uncancellable — only a completed row with
	// an image_url does — so the predicate deliberately ignores it.
	const claim = await claimJobAndRefund({
		job: table.conceptArtGeneration,
		jobId: gen.id,
		errorMessage: 'Cancelled by user',
		claimableWhen: sql`user_id = ${locals.user.id}
			AND status <> 'failed'
			AND NOT (status = 'completed' AND image_url IS NOT NULL)`,
	});

	if (!claim) {
		error(400, 'Cannot cancel a generation that already finished');
	}

	return json({
		success: true,
		tokensRefunded: claim.tokenCost,
		regularTokensRefunded: claim.regularTokens,
		bonusTokensRefunded: claim.bonusTokenCost,
	});
};
