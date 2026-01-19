import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { captionImage } from '$lib/server/fal';
import type { RequestHandler } from './$types';

// POST: Auto-caption all images
export const POST: RequestHandler = async ({ params, locals }) => {
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

	// Update job status to captioning
	await db
		.update(table.trainingJob)
		.set({ status: 'captioning' })
		.where(eq(table.trainingJob.id, job.id));

	const images = await db.query.trainingImage.findMany({
		where: eq(table.trainingImage.trainingJobId, job.id),
	});

	if (images.length === 0) {
		error(400, 'No images to caption');
	}

	// Caption images in batches to avoid rate limits
	const BATCH_SIZE = 5;
	const BATCH_DELAY_MS = 1000;

	for (let i = 0; i < images.length; i += BATCH_SIZE) {
		const batch = images.slice(i, i + BATCH_SIZE);

		await Promise.allSettled(
			batch.map(async (image) => {
				// Mark as processing
				await db
					.update(table.trainingImage)
					.set({ captionStatus: 'processing' })
					.where(eq(table.trainingImage.id, image.id));

				try {
					const caption = await captionImage(image.imageUrl);

					await db
						.update(table.trainingImage)
						.set({
							autoCaption: caption,
							userCaption: image.userCaption || caption, // Only set if not already edited
							captionStatus: 'done',
						})
						.where(eq(table.trainingImage.id, image.id));
				} catch (err) {
					await db
						.update(table.trainingImage)
						.set({ captionStatus: 'failed' })
						.where(eq(table.trainingImage.id, image.id));
				}
			}),
		);

		// Wait before next batch to avoid rate limits
		if (i + BATCH_SIZE < images.length) {
			await new Promise((resolve) => setTimeout(resolve, BATCH_DELAY_MS));
		}
	}

	// Update job status to ready
	await db
		.update(table.trainingJob)
		.set({ status: 'ready' })
		.where(eq(table.trainingJob.id, job.id));

	// Fetch updated images
	const updatedImages = await db.query.trainingImage.findMany({
		where: eq(table.trainingImage.trainingJobId, job.id),
	});

	return json({ images: updatedImages });
};

// PATCH: Update single caption
export const PATCH: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: { imageId: string; caption: string } = await request.json();

	if (!body.imageId) {
		error(400, 'Image ID is required');
	}

	if (typeof body.caption !== 'string') {
		error(400, 'Caption is required');
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

	const [image] = await db
		.update(table.trainingImage)
		.set({ userCaption: body.caption })
		.where(
			and(
				eq(table.trainingImage.id, body.imageId),
				eq(table.trainingImage.trainingJobId, job.id),
			),
		)
		.returning();

	if (!image) {
		error(404, 'Image not found');
	}

	return json({ image });
};
