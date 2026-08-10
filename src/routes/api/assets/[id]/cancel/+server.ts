import { error, json } from '@sveltejs/kit';
import { and, eq, type SQL, sql } from 'drizzle-orm';
import { claimJobAndRefund } from '$lib/server/credits';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelSpriteJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals, url }) => {
	// Build ownership condition. `ownershipClaim` restates it against the
	// physical columns so the atomic claim below can carry the same check.
	let ownershipCondition: SQL | undefined;
	let ownershipClaim: SQL | undefined;
	const isGuest = !locals.user && !!locals.guestSession;

	if (locals.user) {
		ownershipCondition = eq(table.assetGeneration.userId, locals.user.id);
		ownershipClaim = sql`user_id = ${locals.user.id}`;
	} else if (locals.guestSession) {
		ownershipCondition = eq(
			table.assetGeneration.guestSessionId,
			locals.guestSession.id,
		);
		ownershipClaim = sql`guest_session_id = ${locals.guestSession.id}`;
	} else {
		error(401, 'Unauthorized');
	}

	// Force flag allows deleting stuck generations without refund
	const force = url.searchParams.get('force') === 'true';

	const asset = await db.query.assetGeneration.findFirst({
		where: and(eq(table.assetGeneration.id, params.id), ownershipCondition),
	});

	if (!asset) {
		error(404, 'Asset not found');
	}

	// Check if already failed (no double refund)
	if (asset.status === 'failed') {
		error(400, 'Cannot cancel a failed generation');
	}

	// Allow cancelling "completed" generations that have no actual results (stuck)
	// Or if force flag is set, allow deletion without refund
	const hasResults = asset.resultUrls?.processed || asset.resultUrls?.raw;
	const shouldRefund = asset.status !== 'completed' || !hasResults;

	// If completed with results and not forcing, reject
	if (asset.status === 'completed' && hasResults && !force) {
		error(
			400,
			'Cannot cancel a completed generation with results. Use ?force=true to delete without refund.',
		);
	}

	// Cancel the job on fal.ai if it has a request ID
	if (asset.runpodJobId) {
		try {
			await cancelSpriteJob(asset.runpodJobId);
		} catch (e) {
			console.error('Failed to cancel fal.ai job:', e);
		}
	}

	// Force-deleting a generation that really finished credits nothing, so there
	// is no refund to gate — and the row is already terminal, so it cannot become
	// refundable underneath us. A plain guarded update is enough here.
	if (!shouldRefund) {
		await db
			.update(table.assetGeneration)
			.set({ status: 'failed', errorMessage: 'Deleted by user' })
			.where(and(eq(table.assetGeneration.id, asset.id), ownershipCondition));

		return json({
			success: true,
			isGuest,
			tokensRefunded: 0,
			regularTokensRefunded: 0,
			bonusTokensRefunded: 0,
			wasForced: force,
		});
	}

	// The checks above are for reporting a useful error. They cannot gate the
	// refund: they ran against a row read before the fal.ai round trip, and a
	// concurrent request would pass them too. The claim below re-states them as
	// the WHERE of the write, so exactly one caller can ever win. Terminal states
	// are excluded by name rather than listing the active ones, so a status added
	// to the enum later stays cancellable instead of silently becoming un-refundable.
	const claim = await claimJobAndRefund({
		job: table.assetGeneration,
		jobId: asset.id,
		errorMessage: force ? 'Deleted by user' : 'Cancelled by user',
		claimableWhen: sql`(${ownershipClaim})
			AND status <> 'failed'
			AND NOT (status = 'completed'
			         AND (coalesce(result_urls->>'processed', '') <> ''
			              OR coalesce(result_urls->>'raw', '') <> ''))`,
	});

	if (!claim) {
		error(400, 'Cannot cancel a generation that already finished');
	}

	// Guest-owned rows hold no balance to credit: the claim's user_id is null, so
	// nothing was credited and nothing is reported. Report what the claim actually
	// wrote, never the amounts from the read above.
	const credited = claim.userId !== null;
	const regularTokensRefunded = credited ? claim.regularTokens : 0;
	const bonusTokensRefunded = credited ? claim.bonusTokenCost : 0;

	return json({
		success: true,
		isGuest,
		tokensRefunded: regularTokensRefunded + bonusTokensRefunded,
		regularTokensRefunded,
		bonusTokensRefunded,
		wasForced: force,
	});
};
