import { error, json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const job = await db.query.rotationJob.findFirst({
		where: and(
			eq(table.rotationJob.id, params.id),
			eq(table.rotationJob.userId, locals.user.id),
		),
	});

	if (!job) {
		error(404, 'Job not found');
	}

	const response: Record<string, unknown> = {
		id: job.id,
		status: job.status,
	};

	if (job.status === 'processing') {
		response.statusMessage = 'Generating rotations...';
	}

	if (job.status === 'completed') {
		response.rotations = {
			n: job.rotationN,
			ne: job.rotationNE,
			e: job.rotationE,
			se: job.rotationSE,
			s: job.rotationS,
			sw: job.rotationSW,
			w: job.rotationW,
			nw: job.rotationNW,
		};
	}

	if (job.status === 'failed') {
		response.error = job.errorMessage;
	}

	return json(response);
};
