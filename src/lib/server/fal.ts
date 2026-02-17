/**
 * fal.ai API client for sprite generation and rotation jobs.
 */

import { fal } from '@fal-ai/client';
import { env } from '$env/dynamic/private';

const FAL_SPRITE_WORKFLOW_ID = 'workflows/P5ina/sprite';
const FAL_WORKFLOW_ID = 'workflows/P5ina/rotate-truncated';

function configureFal() {
	const key = env.FAL_KEY;
	if (!key) {
		throw new Error('FAL_KEY environment variable is not configured');
	}
	fal.config({ credentials: key });
}

// ============================================================================
// Sprite Generation
// ============================================================================

interface FalSpriteOutput {
	image?: { url: string };
	raw?: { url: string };
	processed?: { url: string };
	seed?: number;
}

/**
 * Submit a sprite generation job to fal.ai
 */
export async function submitSpriteJob(params: {
	prompt: string;
	width?: number;
	height?: number;
	seed?: number;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_SPRITE_WORKFLOW_ID, {
		input: {
			prompt: params.prompt,
			width: params.width ?? 1024,
			height: params.height ?? 1024,
			seed: params.seed,
		},
	});

	return { requestId: request_id };
}

/**
 * Get the status of a sprite generation job from fal.ai
 */
export async function getSpriteJobStatus(requestId: string): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: {
		rawUrl?: string;
		processedUrl?: string;
		seed?: number;
	};
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_SPRITE_WORKFLOW_ID, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(FAL_SPRITE_WORKFLOW_ID, {
				requestId,
			});

			const data = result.data as FalSpriteOutput;

			// Handle different possible output formats from the workflow
			const processedUrl = data?.processed?.url || data?.image?.url;
			const rawUrl = data?.raw?.url;

			return {
				status: 'COMPLETED',
				output: {
					rawUrl,
					processedUrl,
					seed: data?.seed,
				},
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking sprite status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel a sprite generation job on fal.ai
 */
export async function cancelSpriteJob(requestId: string): Promise<void> {
	configureFal();

	await fal.queue.cancel(FAL_SPRITE_WORKFLOW_ID, { requestId });
}

// ============================================================================
// Rotation (4-direction)
// ============================================================================

interface FalRotationOutput {
	front?: { url: string };
	right?: { url: string };
	back?: { url: string };
	left?: { url: string };
}

/**
 * Submit a rotation job to fal.ai and return immediately with request ID
 */
export async function submitRotationJob(params: {
	imageUrl: string;
	elevation?: number;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
			elevation: params.elevation ?? 20,
		},
	});

	return { requestId: request_id };
}

/**
 * Get the status of a rotation job from fal.ai
 */
export async function getRotationJobStatus(requestId: string): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: {
		front?: string;
		right?: string;
		back?: string;
		left?: string;
	};
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_WORKFLOW_ID, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			// Fetch the result
			const result = await fal.queue.result(FAL_WORKFLOW_ID, {
				requestId,
			});

			const data = result.data as FalRotationOutput;
			return {
				status: 'COMPLETED',
				output: {
					front: data?.front?.url,
					right: data?.right?.url,
					back: data?.back?.url,
					left: data?.left?.url,
				},
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel a rotation job on fal.ai
 */
export async function cancelRotationJob(requestId: string): Promise<void> {
	configureFal();

	await fal.queue.cancel(FAL_WORKFLOW_ID, { requestId });
}

const FAL_SINGLE_VIEW_WORKFLOW_ID = 'workflows/P5ina/rotate-one-view';

// Direction angles for calculating relative rotation
export const DIRECTION_ANGLES = {
	input: 0, // Original input image (same as front)
	front: 0,
	right: 90,
	back: 180,
	left: 270,
} as const;

export type SourceDirection = keyof typeof DIRECTION_ANGLES;
export type RotationDirection = 'front' | 'right' | 'back' | 'left';

/**
 * Calculate the horizontal angle needed to rotate from source direction to target direction
 */
export function calculateHorizontalAngle(
	sourceDirection: SourceDirection,
	targetDirection: RotationDirection
): number {
	const sourceAngle = DIRECTION_ANGLES[sourceDirection];
	const targetAngle = DIRECTION_ANGLES[targetDirection];
	// Calculate the angle difference, normalize to 0-359
	let angle = targetAngle - sourceAngle;
	if (angle < 0) angle += 360;
	return angle;
}

interface FalSingleViewOutput {
	rotated?: { url: string };
}

/**
 * Submit a single view rotation job to fal.ai
 */
export async function submitSingleViewRotation(params: {
	imageUrl: string;
	elevation?: number;
	horizontalAngle: number;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_SINGLE_VIEW_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
			elevation: params.elevation ?? 20,
			horizontal_angle: params.horizontalAngle,
		},
	});

	return { requestId: request_id };
}

/**
 * Get the status of a single view rotation job from fal.ai
 */
export async function getSingleViewRotationStatus(requestId: string): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: { url: string };
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_SINGLE_VIEW_WORKFLOW_ID, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(FAL_SINGLE_VIEW_WORKFLOW_ID, {
				requestId,
			});

			const data = result.data as FalSingleViewOutput;
			return {
				status: 'COMPLETED',
				output: data?.rotated ? { url: data.rotated.url } : undefined,
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking single view status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

// ============================================================================
// Spin (OIIA spinning video)
// ============================================================================

const FAL_SPIN_WORKFLOW_ID = 'workflows/P5ina/spin';

/**
 * Submit a spin job to fal.ai
 */
export async function submitSpinJob(params: {
	imageUrl: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_SPIN_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
		},
	});

	return { requestId: request_id };
}

/**
 * Get the status of a spin job from fal.ai
 */
export async function getSpinJobStatus(requestId: string): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: {
		frames: string[];
	};
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_SPIN_WORKFLOW_ID, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(FAL_SPIN_WORKFLOW_ID, {
				requestId,
			});

			const data = result.data as { images?: Array<{ url: string }> };
			const frames: string[] = [];

			// Parse images array from fal.ai workflow
			if (Array.isArray(data?.images)) {
				for (const img of data.images) {
					if (img?.url) {
						frames.push(img.url);
					}
				}
			}

			console.log('[fal.ai] Spin completed with', frames.length, 'frames');

			return {
				status: 'COMPLETED',
				output: { frames },
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking spin status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel a spin job on fal.ai
 */
export async function cancelSpinJob(requestId: string): Promise<void> {
	configureFal();

	await fal.queue.cancel(FAL_SPIN_WORKFLOW_ID, { requestId });
}

// ============================================================================
// Concept Art Generation
// ============================================================================

const FAL_CONCEPT_ART_MODEL = 'fal-ai/z-image/turbo';
const FAL_CONCEPT_ART_REF_MODEL = 'fal-ai/flux/dev/image-to-image';

interface FalConceptArtOutput {
	images?: Array<{ url: string; width: number; height: number }>;
	seed?: number;
	has_nsfw_concepts?: boolean[];
}

/**
 * Submit a concept art generation job to fal.ai
 * When imageUrl is provided, uses flux/dev img2img with 40 steps
 * for smooth reference control (vs turbo's 8-step quantization).
 * Strength is inverted: user's "reference influence" maps to (1 - denoising).
 */
export async function submitConceptArtJob(params: {
	prompt: string;
	imageSize: string;
	seed?: number;
	imageUrl?: string;
	strength?: number;
}): Promise<{ requestId: string }> {
	configureFal();

	if (params.imageUrl) {
		// Invert: user's reference strength → denoising strength
		// 0% reference = 0.95 denoising (almost full regen)
		// 100% reference = 0.01 denoising (nearly identical)
		const referenceInfluence = params.strength ?? 0.6;
		const denoising = Math.max(0.01, 1 - referenceInfluence);

		const { request_id } = await fal.queue.submit(FAL_CONCEPT_ART_REF_MODEL, {
			input: {
				prompt: params.prompt,
				image_url: params.imageUrl,
				strength: denoising,
				num_inference_steps: 40,
				seed: params.seed,
				// image_size is accepted by the API but missing from the SDK type
				...({ image_size: params.imageSize, output_format: 'png' } as Record<string, unknown>),
			},
		});
		return { requestId: request_id };
	}

	// Text-to-image (no reference) uses z-image/turbo
	const { request_id } = await fal.queue.submit(FAL_CONCEPT_ART_MODEL, {
		input: {
			prompt: params.prompt,
			image_size: params.imageSize as 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9',
			num_inference_steps: 8,
			seed: params.seed,
			enable_safety_checker: true,
			output_format: 'png',
		},
	});

	return { requestId: request_id };
}

/**
 * Get the status of a concept art generation job from fal.ai
 */
export async function getConceptArtJobStatus(
	requestId: string,
	hasReferenceImage?: boolean,
): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: {
		imageUrl: string;
		seed?: number;
	};
	error?: string;
}> {
	configureFal();

	const model = hasReferenceImage ? FAL_CONCEPT_ART_REF_MODEL : FAL_CONCEPT_ART_MODEL;

	try {
		const status = await fal.queue.status(model, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(model, {
				requestId,
			});

			const data = result.data as FalConceptArtOutput;
			const imageUrl = data?.images?.[0]?.url;

			return {
				status: 'COMPLETED',
				output: imageUrl
					? {
							imageUrl,
							seed: data?.seed,
						}
					: undefined,
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking concept art status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel a concept art generation job on fal.ai
 */
export async function cancelConceptArtJob(
	requestId: string,
	hasReferenceImage?: boolean,
): Promise<void> {
	configureFal();

	const model = hasReferenceImage ? FAL_CONCEPT_ART_REF_MODEL : FAL_CONCEPT_ART_MODEL;
	await fal.queue.cancel(model, { requestId });
}

// ============================================================================
// Concept Art Restyle (two-step: preprocess → generate)
// ============================================================================

const FAL_CANNY_PREPROCESSOR = 'fal-ai/image-preprocessors/hed';
const FAL_DEPTH_PREPROCESSOR = 'fal-ai/image-preprocessors/depth-anything/v2';
const FAL_RESTYLE_CANNY_MODEL = 'fal-ai/flux-control-lora-canny';
const FAL_RESTYLE_DEPTH_MODEL = 'fal-ai/flux-control-lora-depth';

type ImageSize = 'square_hd' | 'square' | 'portrait_4_3' | 'portrait_16_9' | 'landscape_4_3' | 'landscape_16_9';

function getPreprocessorModel(method: 'canny' | 'depth') {
	return method === 'depth' ? FAL_DEPTH_PREPROCESSOR : FAL_CANNY_PREPROCESSOR;
}

/**
 * Step 1: Submit a preprocessor job to the queue (non-blocking).
 */
export async function submitPreprocessorJob(params: {
	imageUrl: string;
	method: 'canny' | 'depth';
}): Promise<{ requestId: string }> {
	configureFal();

	const model = getPreprocessorModel(params.method);

	const { request_id } = await fal.queue.submit(model, {
		input: { image_url: params.imageUrl },
	});

	return { requestId: request_id };
}

/**
 * Check the status of a preprocessor job.
 */
export async function getPreprocessorJobStatus(
	requestId: string,
	method: 'canny' | 'depth',
): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: { imageUrl: string };
	error?: string;
}> {
	configureFal();

	const model = getPreprocessorModel(method);

	try {
		const status = await fal.queue.status(model, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(model, { requestId });
			const data = result.data as { image?: { url: string } };

			return {
				status: 'COMPLETED',
				output: data?.image?.url ? { imageUrl: data.image.url } : undefined,
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking preprocessor status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Step 2: Submit restyle generation using the preprocessed control image.
 * Uses flux-control-lora-canny or flux-control-lora-depth.
 */
export async function submitRestyleGeneration(params: {
	prompt: string;
	imageSize: string;
	controlImageUrl: string;
	controlMethod: 'canny' | 'depth';
	controlStrength: number; // 0-2 (model range)
	seed?: number;
}): Promise<{ requestId: string }> {
	configureFal();

	const model = params.controlMethod === 'depth'
		? FAL_RESTYLE_DEPTH_MODEL
		: FAL_RESTYLE_CANNY_MODEL;

	const baseInput = {
		prompt: params.prompt,
		control_lora_image_url: params.controlImageUrl,
		control_lora_strength: params.controlStrength,
		seed: params.seed,
		num_inference_steps: 28,
	};

	const { request_id } = await fal.queue.submit(model, {
		input: {
			...baseInput,
			// image_size and output_format are accepted by the API but may be missing from SDK types
			...({
				image_size: params.imageSize,
				output_format: 'png',
				...(params.controlMethod === 'depth' ? { preprocess_depth: false } : {}),
			} as Record<string, unknown>),
		},
	});

	return { requestId: request_id };
}

/**
 * Get the status of a restyle generation job from fal.ai
 */
export async function getRestyleJobStatus(
	requestId: string,
	controlMethod: 'canny' | 'depth',
): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: {
		imageUrl: string;
		seed?: number;
	};
	error?: string;
}> {
	configureFal();

	const model = controlMethod === 'depth'
		? FAL_RESTYLE_DEPTH_MODEL
		: FAL_RESTYLE_CANNY_MODEL;

	try {
		const status = await fal.queue.status(model, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(model, {
				requestId,
			});

			const data = result.data as FalConceptArtOutput;
			const imageUrl = data?.images?.[0]?.url;

			return {
				status: 'COMPLETED',
				output: imageUrl
					? {
							imageUrl,
							seed: data?.seed,
						}
					: undefined,
			};
		}

		return {
			status: status.status as 'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error: unknown) {
		const body = (error as { body?: unknown })?.body;
		console.error('[fal.ai] Error checking restyle status:', error);
		if (body) console.error('[fal.ai] Error body:', JSON.stringify(body, null, 2));
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel a restyle generation job on fal.ai
 */
export async function cancelRestyleJob(
	requestId: string,
	controlMethod: 'canny' | 'depth',
): Promise<void> {
	configureFal();

	const model = controlMethod === 'depth'
		? FAL_RESTYLE_DEPTH_MODEL
		: FAL_RESTYLE_CANNY_MODEL;
	await fal.queue.cancel(model, { requestId });
}
