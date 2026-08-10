import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import {
	cancelAnimateJob,
	cancelVideoBackgroundRemovalJob,
} from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const job = await db.query.animationJob.findFirst({
		where: eq(table.animationJob.id, params.id),
	});

	if (!job || job.userId !== locals.user.id) {
		error(404, 'Job not found');
	}

	if (job.status === 'completed' || job.status === 'failed') {
		error(400, 'Job already finished');
	}

	// Best effort: one upstream fal.ai job per direction, plus the background
	// removal jobs. None of it may keep the claim below from running, so every
	// failure is logged and swallowed here rather than propagated.
	try {
		if (job.falRequestIds) {
			const requestIds = job.falRequestIds as Record<string, string>;
			for (const requestId of Object.values(requestIds)) {
				try {
					await cancelAnimateJob(requestId);
				} catch (e) {
					console.error('Failed to cancel fal.ai animation job:', e);
				}
			}
		}
		if (job.bgRemovalRequestIds) {
			const requestIds = job.bgRemovalRequestIds as Record<string, string>;
			for (const requestId of Object.values(requestIds)) {
				try {
					await cancelVideoBackgroundRemovalJob(requestId);
				} catch (e) {
					console.error('Failed to cancel fal.ai bg removal job:', e);
				}
			}
		}
	} catch (e) {
		console.error('Failed to cancel upstream fal.ai jobs:', e);
	}

	// The status check above is for reporting a useful error. It cannot gate the
	// refund: it ran against a row read before the fal.ai round trips, and a
	// concurrent request would pass it too. The claim below re-states it — plus
	// the ownership predicate — as the WHERE of the write, so exactly one caller
	// can ever win and credit the balance.
	const claim = await claimJobAndRefund({
		job: table.animationJob,
		jobId: job.id,
		errorMessage: 'Cancelled by user',
		claimableWhen: sql`user_id = ${locals.user.id}
			AND status NOT IN ('completed', 'failed')`,
	});

	if (!claim) {
		error(400, 'Job already finished');
	}

	return json({
		success: true,
		regularTokensRefunded: claim.regularTokens,
		bonusTokensRefunded: claim.bonusTokenCost,
	});
};
