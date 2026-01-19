import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { getTrainingResult, getTrainingStatus } from '$lib/server/fal';
import type { RequestHandler } from './$types';

// GET: Poll training progress
export const GET: RequestHandler = async ({ params, locals }) => {
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

	// If already completed or failed, return current state
	if (job.status === 'completed' || job.status === 'failed') {
		return json({
			status: job.status,
			progress: job.progress,
			resultLoraId: job.resultLoraId,
			errorMessage: job.errorMessage,
		});
	}

	if (!job.falRequestId) {
		// Job is still preparing (uploading zip, etc.)
		return json({
			status: 'training',
			progress: 0,
			queueStatus: 'PREPARING',
			logs: [],
		});
	}

	try {
		console.log('[status] Polling for request:', job.falRequestId);
		const status = await getTrainingStatus(job.falRequestId);
		console.log('[status] Got status:', JSON.stringify(status, null, 2));

		// Extract progress from logs if available
		let progress = job.progress || 0;
		const statusAny = status as unknown as Record<string, unknown>;
		if (statusAny.logs && Array.isArray(statusAny.logs)) {
			// Try to extract step progress from logs
			const stepMatch = (statusAny.logs as string[])
				.join('\n')
				.match(/step\s*(\d+)\s*\/\s*(\d+)/i);
			if (stepMatch) {
				const currentStep = parseInt(stepMatch[1], 10);
				const totalSteps = parseInt(stepMatch[2], 10);
				progress = Math.round((currentStep / totalSteps) * 100);
			}
		}

		// Update progress in database
		if (progress !== job.progress) {
			await db
				.update(table.trainingJob)
				.set({ progress })
				.where(eq(table.trainingJob.id, job.id));
		}

		if (status.status === 'COMPLETED') {
			// Get the result
			const result = await getTrainingResult(job.falRequestId);

			// Extract LoRA URL from result
			const resultData = result.data as Record<string, unknown> | undefined;
			const diffusersFile = resultData?.diffusers_lora_file as
				| { url: string }
				| undefined;
			const loraUrl = diffusersFile?.url || (resultData?.lora_url as string);

			if (!loraUrl) {
				throw new Error('No LoRA file in result');
			}

			// Create LoRA in library
			const [lora] = await db
				.insert(table.lora)
				.values({
					id: nanoid(),
					visibleId: nanoid(10),
					name: job.name,
					falUrl: loraUrl,
					userId: locals.user.id,
				})
				.returning();

			// Update job as completed
			await db
				.update(table.trainingJob)
				.set({
					status: 'completed',
					progress: 100,
					resultLoraId: lora.id,
					completedAt: new Date(),
				})
				.where(eq(table.trainingJob.id, job.id));

			return json({
				status: 'completed',
				progress: 100,
				resultLoraId: lora.id,
				lora,
			});
		}

		// Check for failure by looking at status property
		if (statusAny.error) {
			const errorMessage = String(statusAny.error) || 'Training failed';

			await db
				.update(table.trainingJob)
				.set({
					status: 'failed',
					errorMessage,
				})
				.where(eq(table.trainingJob.id, job.id));

			return json({
				status: 'failed',
				progress,
				errorMessage,
			});
		}

		// Still in progress
		return json({
			status: 'training',
			progress,
			queueStatus: status.status,
			logs: Array.isArray(statusAny.logs) ? statusAny.logs : [],
		});
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Status check failed';
		error(500, message);
	}
};
