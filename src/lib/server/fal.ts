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
