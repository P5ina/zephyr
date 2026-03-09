import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
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

	// Cancel all fal.ai jobs
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

	// Refund tokens
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

	await db
		.update(table.animationJob)
		.set({
			status: 'failed',
			errorMessage: 'Cancelled by user',
		})
		.where(eq(table.animationJob.id, job.id));

	return json({
		success: true,
		regularTokensRefunded,
		bonusTokensRefunded,
	});
};
