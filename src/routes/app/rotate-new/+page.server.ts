import { redirect } from '@sveltejs/kit';
import { and, desc, eq, isNotNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/login');
	}

	const [rotationJobs, sprites] = await Promise.all([
		db.query.rotationJobNew.findMany({
			where: eq(table.rotationJobNew.userId, locals.user.id),
			orderBy: [desc(table.rotationJobNew.createdAt)],
			limit: 20,
		}),
		// Fetch completed sprite generations for selection
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

	return {
		rotationJobs,
		sprites,
	};
};
