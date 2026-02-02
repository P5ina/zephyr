import { error, json } from '@sveltejs/kit';
import { and, eq, or, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { cancelSpinJob } from '$lib/server/fal';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, locals }) => {
	// Build query - allow access for owner (user or guest)
	const job = await db.query.spinJob.findFirst({
		where: and(
			eq(table.spinJob.id, params.id),
			or(
				locals.user ? eq(table.spinJob.userId, locals.user.id) : undefined,
				locals.guestSession ? eq(table.spinJob.guestSessionId, locals.guestSession.id) : undefined,
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

	// Refund tokens if this was a paid job
	let regularTokensRefunded = 0;
	let bonusTokensRefunded = 0;

	if (job.userId && job.tokenCost > 0) {
		regularTokensRefunded = job.tokenCost - job.bonusTokenCost;
		bonusTokensRefunded = job.bonusTokenCost;

		await db
			.update(table.user)
			.set({
				tokens: sql`${table.user.tokens} + ${regularTokensRefunded}`,
				bonusTokens: sql`${table.user.bonusTokens} + ${bonusTokensRefunded}`,
			})
			.where(eq(table.user.id, job.userId));
	}

	// Mark job as failed
	await db
		.update(table.spinJob)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.spinJob.id, job.id));

	return json({
		success: true,
		regularTokensRefunded,
		bonusTokensRefunded,
	});
};
