import type { Config } from '@sveltejs/adapter-vercel';
import { error, json } from '@sveltejs/kit';
import { eq, sql } from 'drizzle-orm';
import { ANIMATION_META, type AnimationType } from '$lib/animation-config';
import { getAnimationReprocessTokenCost } from '$lib/pricing';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const config: Config = {
	runtime: 'nodejs22.x',
	memory: 3009,
	maxDuration: 120,
};

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

	if (job.status !== 'completed') {
		error(400, 'Can only re-export completed jobs');
	}

	const directionVideos = job.directionVideos as Record<string, string> | null;
	if (!directionVideos || Object.keys(directionVideos).length === 0) {
		error(400, 'No direction videos available for re-export');
	}

	const frameCount = job.frameCount ?? ANIMATION_META[job.animationType as AnimationType].framesPerLoop;
	const reexportCost = getAnimationReprocessTokenCost(
		frameCount,
		job.directionCount as 4 | 8,
	);
	const availableTokens = locals.user.tokens + locals.user.bonusTokens;

	if (availableTokens < reexportCost) {
		error(402, `Not enough tokens. Required: ${reexportCost}, available: ${availableTokens}`);
	}

	const bonusDeduct = Math.min(locals.user.bonusTokens, reexportCost);
	const regularDeduct = reexportCost - bonusDeduct;

	await db
		.update(table.user)
		.set({
			bonusTokens: sql`${table.user.bonusTokens} - ${bonusDeduct}`,
			tokens: sql`${table.user.tokens} - ${regularDeduct}`,
		})
		.where(eq(table.user.id, locals.user.id));

	await db
		.update(table.animationJob)
		.set({
			status: 'processing',
			currentStage: `Removing backgrounds (0/${frameCount * (job.directionCount as 4 | 8)})...`,
			progress: 55,
			spritesheetUrl: null,
			frameCount: null,
			tileWidth: null,
			tileHeight: null,
			bgRemovalRequestIds: null,
			bgRemovedVideos: null,
			tokenCost: reexportCost,
			bonusTokenCost: bonusDeduct,
			errorMessage: null,
		})
		.where(eq(table.animationJob.id, job.id));

	return json({
		success: true,
		tokensRemaining: locals.user.tokens - regularDeduct,
		bonusTokensRemaining: locals.user.bonusTokens - bonusDeduct,
	});
};
