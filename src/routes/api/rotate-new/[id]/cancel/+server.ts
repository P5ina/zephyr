import { error, json } from '@sveltejs/kit';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelRotationJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	let ownershipCondition: SQL | undefined;
	// The same ownership test as raw SQL, so the claim below can re-state it.
	let ownershipClaim: SQL | undefined;

	if (locals.user) {
		ownershipCondition = eq(table.rotationJobNew.userId, locals.user.id);
		ownershipClaim = sql`user_id = ${locals.user.id}`;
	} else if (locals.guestSession) {
		ownershipCondition = eq(
			table.rotationJobNew.guestSessionId,
			locals.guestSession.id,
		);
		ownershipClaim = sql`guest_session_id = ${locals.guestSession.id}`;
	} else {
		error(401, 'Unauthorized');
	}

	const rotation = await db.query.rotationJobNew.findFirst({
		where: and(eq(table.rotationJobNew.id, params.id), ownershipCondition),
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

	// The checks above are for reporting a useful error. They cannot gate the
	// refund: they ran against a row read before the fal.ai round trip, and a
	// concurrent request would pass them too. The claim below re-states them as
	// the WHERE of the write, so exactly one caller can ever win.
	const claim = await claimJobAndRefund({
		job: table.rotationJobNew,
		jobId: rotation.id,
		errorMessage: 'Cancelled by user',
		claimableWhen: sql`${ownershipClaim}
			AND status <> 'failed'
			AND NOT (status = 'completed'
			         AND (rotation_front IS NOT NULL OR rotation_back IS NOT NULL))`,
	});

	if (!claim) {
		error(400, 'Cannot cancel a generation that already finished');
	}

	// Guest-owned jobs hold no balance to credit (they are created with
	// tokenCost: 0), so the claim credits nothing and reports nothing.
	if (!claim.userId) {
		return json({
			success: true,
			tokensRefunded: 0,
			regularTokensRefunded: 0,
			bonusTokensRefunded: 0,
		});
	}

	return json({
		success: true,
		tokensRefunded: claim.tokenCost,
		regularTokensRefunded: claim.regularTokens,
		bonusTokensRefunded: claim.bonusTokenCost,
	});
};
