import { fal } from '@fal-ai/client';
import { building } from '$app/environment';
import { env } from '$env/dynamic/private';

if (!building && env.FAL_KEY) {
	fal.config({ credentials: env.FAL_KEY });
}

export interface GenerateImageOptions {
	prompt: string;
	width?: number;
	height?: number;
	numInferenceSteps?: number;
	numImages?: number;
	seed?: number;
	loras?: Array<{ path: string; scale: number }>;
	enableSafetyChecker?: boolean;
}

export interface GeneratedImage {
	url: string;
	width: number;
	height: number;
	content_type: string;
}

export interface GenerateImageResult {
	images: GeneratedImage[];
	seed: number;
	prompt: string;
}

export async function generateImage(
	options: GenerateImageOptions,
): Promise<GenerateImageResult> {
	const {
		prompt,
		width = 1024,
		height = 1024,
		numInferenceSteps = 8,
		numImages = 1,
		seed,
		loras,
		enableSafetyChecker = false,
	} = options;

	const useLoras = loras && loras.length > 0;
	const endpoint = useLoras
		? 'fal-ai/z-image/turbo/lora'
		: 'fal-ai/z-image/turbo';

	const input: Record<string, unknown> = {
		prompt,
		image_size: { width, height },
		num_inference_steps: numInferenceSteps,
		num_images: numImages,
		enable_safety_checker: enableSafetyChecker,
	};

	if (seed !== undefined) {
		input.seed = seed;
	}

	if (useLoras) {
		input.loras = loras;
	}

	try {
		const result = await fal.subscribe(endpoint, { input } as Parameters<
			typeof fal.subscribe
		>[1]);

		const images = result.data.images as GeneratedImage[] | undefined;
		if (!images || images.length === 0) {
			throw new Error('No images generated');
		}

		return {
			images,
			seed: result.data.seed as number,
			prompt: result.data.prompt as string,
		};
	} catch (err) {
		const message =
			err instanceof Error ? err.message : 'Image generation failed';
		throw new Error(message);
	}
}

export async function uploadToFalStorage(file: File): Promise<string> {
	const url = await fal.storage.upload(file);
	return url;
}

// Auto-caption an image using Florence-2
export async function captionImage(imageUrl: string): Promise<string> {
	const result = await fal.subscribe('fal-ai/florence-2-large/more-detailed-caption', {
		input: {
			image_url: imageUrl,
		},
	});
	return result.data.results as string;
}

// Start training job (queue-based)
export async function startTraining(
	zipUrl: string,
	steps: number,
	triggerWord?: string,
): Promise<{ request_id: string }> {
	const input: Record<string, unknown> = {
		image_data_url: zipUrl,
		steps,
	};

	if (triggerWord) {
		input.trigger_word = triggerWord;
	}

	console.log('[fal] Starting training with input:', JSON.stringify(input, null, 2));

	const result = await fal.queue.submit('fal-ai/z-image-trainer', { input });

	console.log('[fal] Submit result:', JSON.stringify(result, null, 2));

	if (!result.request_id) {
		throw new Error('No request_id returned from fal.ai');
	}

	return result;
}

// Check training status
export async function getTrainingStatus(requestId: string) {
	return await fal.queue.status('fal-ai/z-image-trainer', {
		requestId,
		logs: true,
	});
}

// Cancel training job
export async function cancelTraining(requestId: string): Promise<void> {
	try {
		await fal.queue.cancel('fal-ai/z-image-trainer', { requestId });
		console.log('[fal] Cancelled training request:', requestId);
	} catch (err) {
		console.error('[fal] Failed to cancel training:', err);
		// Don't throw - we still want to delete the job even if cancel fails
	}
}

// Get training result
export async function getTrainingResult(requestId: string) {
	return await fal.queue.result('fal-ai/z-image-trainer', { requestId });
}
