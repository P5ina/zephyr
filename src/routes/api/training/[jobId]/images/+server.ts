import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { uploadToFalStorage } from '$lib/server/fal';
import type { RequestHandler } from './$types';

// POST: Add image to training job
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

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		error(400, 'No file provided');
	}

	// Validate file type
	if (!file.type.startsWith('image/')) {
		error(400, 'File must be an image');
	}

	// Validate file size (max 10MB)
	if (file.size > 10 * 1024 * 1024) {
		error(400, 'File size must be less than 10MB');
	}

	// Upload to fal.ai storage
	const imageUrl = await uploadToFalStorage(file);

	const [image] = await db
		.insert(table.trainingImage)
		.values({
			id: nanoid(),
			trainingJobId: job.id,
			imageUrl,
			filename: file.name,
		})
		.returning();

	return json({ image });
};

// DELETE: Remove image from training job
export const DELETE: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: { imageId: string } = await request.json();

	if (!body.imageId) {
		error(400, 'Image ID is required');
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
		error(400, 'Cannot remove images at this stage');
	}

	await db
		.delete(table.trainingImage)
		.where(
			and(
				eq(table.trainingImage.id, body.imageId),
				eq(table.trainingImage.trainingJobId, job.id),
			),
		);

	return json({ success: true });
};
