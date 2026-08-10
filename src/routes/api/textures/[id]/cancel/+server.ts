import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelJob } from '$lib/server/runpod';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const texture = await db.query.textureGeneration.findFirst({
		where: and(
			eq(table.textureGeneration.id, params.id),
			eq(table.textureGeneration.userId, locals.user.id),
		),
	});

	if (!texture) {
		error(404, 'Texture not found');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	const hasResults = texture.basecolorUrl || texture.normalUrl;

	if (texture.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	if (texture.status === 'completed' && hasResults) {
		error(400, 'Cannot cancel a completed generation with results');
	}

	// Cancel the job on RunPod if it has a RunPod job ID
	if (texture.runpodJobId) {
		try {
			await cancelJob(texture.runpodJobId);
		} catch (e) {
			console.error('Failed to cancel RunPod job:', e);
		}
	}

	// The checks above are for reporting a useful error. They cannot gate the
	// refund: they ran against a row read before the RunPod round trip, and a
	// concurrent request would pass them too. The claim below re-states them as
	// the WHERE of the write, so exactly one caller can ever win.
	const claim = await claimJobAndRefund({
		job: table.textureGeneration,
		jobId: texture.id,
		errorMessage: 'Cancelled by user',
		claimableWhen: sql`user_id = ${locals.user.id}
			AND status <> 'failed'
			AND NOT (status = 'completed'
			         AND (basecolor_url IS NOT NULL OR normal_url IS NOT NULL))`,
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
