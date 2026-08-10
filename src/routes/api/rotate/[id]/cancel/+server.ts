import { error, json } from '@sveltejs/kit';
import { and, eq, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelRotation8DirJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	const isGuest = !locals.user;

	// Both forms of the same ownership rule: the drizzle condition for the read
	// that produces the 404, and the raw-SQL predicate that has to be restated
	// inside the claim so a concurrent caller cannot pass it.
	const owner = locals.user
		? {
				condition: eq(table.rotationJob.userId, locals.user.id),
				claimable: sql`user_id = ${locals.user.id}`,
			}
		: locals.guestSession
			? {
					condition: eq(
						table.rotationJob.guestSessionId,
						locals.guestSession.id,
					),
					claimable: sql`guest_session_id = ${locals.guestSession.id}`,
				}
			: null;

	if (!owner) {
		error(401, 'Unauthorized');
	}

	const rotation = await db.query.rotationJob.findFirst({
		where: and(eq(table.rotationJob.id, params.id), owner.condition),
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

	// The checks above are for reporting a useful error. They cannot gate the
	// refund: they ran against a row read before the fal.ai round trip, and a
	// concurrent request would pass them too. The claim below re-states them as
	// the WHERE of the write, so exactly one caller can ever win.
	const claim = await claimJobAndRefund({
		job: table.rotationJob,
		jobId: rotation.id,
		errorMessage: 'Cancelled by user',
		claimableWhen: sql`${owner.claimable}
			AND status <> 'failed'
			AND NOT (status = 'completed'
			         AND (rotation_n IS NOT NULL OR rotation_s IS NOT NULL))`,
	});

	if (!claim) {
		error(400, 'Cannot cancel a generation that already finished');
	}

	// Only refund tokens for authenticated users (guests have tokenCost: 0)
	if (!isGuest && claim.userId) {
		return json({
			success: true,
			tokensRefunded: claim.tokenCost,
			regularTokensRefunded: claim.regularTokens,
			bonusTokensRefunded: claim.bonusTokenCost,
		});
	}

	return json({
		success: true,
		tokensRefunded: 0,
		regularTokensRefunded: 0,
		bonusTokensRefunded: 0,
	});
};
