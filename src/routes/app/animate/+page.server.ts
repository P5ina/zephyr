import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		const [animationJobs, sprites, rotations4, rotations8] = await Promise.all([
			db.query.animationJob.findMany({
				where: eq(table.animationJob.userId, locals.user.id),
				orderBy: [desc(table.animationJob.createdAt)],
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
			db.query.rotationJobNew.findMany({
				where: and(
					eq(table.rotationJobNew.userId, locals.user.id),
					eq(table.rotationJobNew.status, 'completed'),
				),
				orderBy: [desc(table.rotationJobNew.createdAt)],
				limit: 20,
				columns: {
					id: true,
					inputImageUrl: true,
					rotationFront: true,
					rotationRight: true,
					rotationBack: true,
					rotationLeft: true,
					createdAt: true,
				},
			}),
			db.query.rotationJob.findMany({
				where: and(
					eq(table.rotationJob.userId, locals.user.id),
					eq(table.rotationJob.status, 'completed'),
				),
				orderBy: [desc(table.rotationJob.createdAt)],
				limit: 20,
				columns: {
					id: true,
					inputImageUrl: true,
					rotationN: true,
					rotationNE: true,
					rotationE: true,
					rotationSE: true,
					rotationS: true,
					rotationSW: true,
					rotationW: true,
					rotationNW: true,
					createdAt: true,
				},
			}),
		]);

		return { animationJobs, sprites, rotations4, rotations8 };
	}

	return { animationJobs: [], sprites: [], rotations4: [], rotations8: [] };
};
