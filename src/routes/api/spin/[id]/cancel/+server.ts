import { error, json } from '@sveltejs/kit';
import { and, eq, or, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelSpinJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const user = locals.user;
	const guestSession = locals.guestSession;

	// Without this guard the ownership filter below authorises nobody as
	// everybody: drizzle's or() drops undefined arms and returns undefined when
	// none survive, and() drops that arm in turn, and what is left is a bare id
	// match. 401 rather than 404 — it is returned before any lookup, so it is
	// identical for a real and an imaginary id and confirms nothing, and it is
	// the status the other cancel endpoints already use for "prove who you are".
	if (!user && !guestSession) {
		error(401, 'Unauthorized');
	}

	const job = await db.query.spinJob.findFirst({
		where: and(
			eq(table.spinJob.id, params.id),
			or(
				user ? eq(table.spinJob.userId, user.id) : undefined,
				guestSession
					? eq(table.spinJob.guestSessionId, guestSession.id)
					: undefined,
			),
		),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	if (job.status === 'completed' || job.status === 'failed') {
		error(400, 'Job already finished');
	}

	// Cancel fal.ai job if we have a request ID
	if (job.falRequestId) {
		try {
			await cancelSpinJob(job.falRequestId);
		} catch (e) {
			console.error('Failed to cancel fal.ai job:', e);
			// Continue anyway - we'll still mark as failed locally
		}
	}

	// The status check above only buys a nicer error message: it ran against a
	// row read before the fal.ai round trip, and a concurrent request would pass
	// it too. The claim restates it — plus the ownership predicate, so a caller
	// who never owned the job cannot win either — as the WHERE of the write, and
	// the credit hangs off that write. Exactly one caller can ever be refunded.
	const claim = await claimJobAndRefund({
		job: table.spinJob,
		jobId: job.id,
		errorMessage: 'Cancelled by user',
		claimableWhen: sql`(
				${user ? sql`user_id = ${user.id}` : sql`false`}
				OR ${guestSession ? sql`guest_session_id = ${guestSession.id}` : sql`false`}
			)
			AND status NOT IN ('completed', 'failed')`,
	});

	if (!claim) {
		error(400, 'Job already finished');
	}

	// A guest-owned job holds no balance to credit, so nothing was refunded.
	return json({
		success: true,
		regularTokensRefunded: claim.userId ? claim.regularTokens : 0,
		bonusTokensRefunded: claim.userId ? claim.bonusTokenCost : 0,
	});
};
