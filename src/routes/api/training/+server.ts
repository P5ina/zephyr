import { error, json } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// GET: List user's training jobs
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const jobs = await db.query.trainingJob.findMany({
		where: eq(table.trainingJob.userId, locals.user.id),
		orderBy: desc(table.trainingJob.createdAt),
	});

	return json({ jobs });
};

interface CreateJobRequest {
	name: string;
}

// POST: Create new training job
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: CreateJobRequest = await request.json();

	if (!body.name || body.name.trim().length === 0) {
		error(400, 'Name is required');
	}

	const [job] = await db
		.insert(table.trainingJob)
		.values({
			id: nanoid(),
			visibleId: nanoid(10),
			name: body.name.trim(),
			userId: locals.user.id,
		})
		.returning();

	return json({ job });
};
