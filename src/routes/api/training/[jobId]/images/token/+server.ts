import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { put } from '@vercel/blob';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// POST: Get Vercel Blob upload token for direct upload
export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const job = await db.query.trainingJob.findFirst({
		where: and(
			eq(table.trainingJob.id, params.jobId),
			eq(table.trainingJob.userId, locals.user.id),
		),
	});

	if (!job) {
		error(404, 'Training job not found');
	}

	if (job.status !== 'uploading' && job.status !== 'ready') {
		error(400, 'Cannot add images at this stage');
	}

	const body: { filename: string; contentType: string } = await request.json();

	if (!body.filename) {
		error(400, 'Filename is required');
	}

	// For now, we'll upload directly through the server
	// In a production environment, you might want to use client-side upload tokens
	return json({
		uploadUrl: `/api/training/${params.jobId}/images`,
		method: 'POST',
	});
};
