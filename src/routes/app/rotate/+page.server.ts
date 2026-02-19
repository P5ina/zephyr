import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import * as guestAuth from '$lib/server/guest-auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		const [rotationJobs, sprites] = await Promise.all([
			db.query.rotationJob.findMany({
				where: eq(table.rotationJob.userId, locals.user.id),
				orderBy: [desc(table.rotationJob.createdAt)],
				limit: 20,
			}),
			db.query.assetGeneration.findMany({
				where: and(
					eq(table.assetGeneration.userId, locals.user.id),
					eq(table.assetGeneration.status, 'completed'),
					isNotNull(table.assetGeneration.resultUrls),
				),
				orderBy: [desc(table.assetGeneration.createdAt)],
				limit: 50,
				columns: {
					id: true,
					prompt: true,
					resultUrls: true,
					createdAt: true,
				},
			}),
		]);

		return { rotationJobs, sprites };
	}

	// Guest flow - load guest rotation jobs if they have a session
	if (locals.guestSession) {
		const [rotationJobs, sprites, guestRotationsUsed] = await Promise.all([
			db.query.rotationJob.findMany({
				where: eq(table.rotationJob.guestSessionId, locals.guestSession.id),
				orderBy: [desc(table.rotationJob.createdAt)],
				limit: 20,
			}),
			db.query.assetGeneration.findMany({
				where: and(
					eq(table.assetGeneration.guestSessionId, locals.guestSession.id),
					eq(table.assetGeneration.status, 'completed'),
					isNotNull(table.assetGeneration.resultUrls),
				),
				orderBy: [desc(table.assetGeneration.createdAt)],
				limit: 50,
				columns: {
					id: true,
					prompt: true,
					resultUrls: true,
					createdAt: true,
				},
			}),
			guestAuth.countGuestRotations(locals.guestSession.id),
		]);

		return { rotationJobs, sprites, guestRotationsUsed };
	}

	// No session yet - empty state
	return { rotationJobs: [], sprites: [] };
};
