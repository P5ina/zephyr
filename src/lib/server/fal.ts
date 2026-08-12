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
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_SPRITE_WORKFLOW_ID, {
		input: {
			prompt: params.prompt,
			width: params.width ?? 512,
			height: params.height ?? 512,
			// Always an integer, never absent.
			//
			// The workflow declares `seed` with an empty string as its default and
			// hands that straight to the generator, which parses it as an integer
			// and rejects the request with a 422. Omitting the seed therefore
			// fails every generation, and almost nobody sets one.
			//
			// Picking the number here also makes the result repeatable, which
			// leaving it to the generator never was.
			seed: params.seed ?? Math.floor(Math.random() * 4_294_967_296),
		},
		webhookUrl: params.webhookUrl,
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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
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
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
			elevation: params.elevation ?? 20,
		},
		webhookUrl: params.webhookUrl,
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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
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

// ============================================================================
// Rotation (8-direction)
// ============================================================================

const FAL_ROTATION_8DIR_WORKFLOW_ID = 'workflows/P5ina/rotate';

interface FalRotation8DirOutput {
	image?: { url: string; content_type: string; width: number; height: number };
	image_2?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
	image_3?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
	image_4?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
	image_5?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
	image_6?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
	image_7?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
	image_8?: {
		url: string;
		content_type: string;
		width: number;
		height: number;
	};
}

/**
 * Submit an 8-direction rotation job to fal.ai
 */
export async function submitRotation8DirJob(params: {
	imageUrl: string;
	elevation?: number;
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_ROTATION_8DIR_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
			elevation: params.elevation ?? 20,
		},
		webhookUrl: params.webhookUrl,
	});

	return { requestId: request_id };
}

/**
 * Get the status of an 8-direction rotation job from fal.ai
 * Maps: image=S, image_2=SW, image_3=W, image_4=NW, image_5=N, image_6=NE, image_7=E, image_8=SE
 */
export async function getRotation8DirJobStatus(requestId: string): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: {
		n?: string;
		ne?: string;
		e?: string;
		se?: string;
		s?: string;
		sw?: string;
		w?: string;
		nw?: string;
	};
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_ROTATION_8DIR_WORKFLOW_ID, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(FAL_ROTATION_8DIR_WORKFLOW_ID, {
				requestId,
			});

			const data = result.data as FalRotation8DirOutput;
			return {
				status: 'COMPLETED',
				output: {
					s: data?.image?.url,
					sw: data?.image_2?.url,
					w: data?.image_3?.url,
					nw: data?.image_4?.url,
					n: data?.image_5?.url,
					ne: data?.image_6?.url,
					e: data?.image_7?.url,
					se: data?.image_8?.url,
				},
			};
		}

		return {
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		console.error('[fal.ai] Error checking 8-dir rotation status:', error);
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel an 8-direction rotation job on fal.ai
 */
export async function cancelRotation8DirJob(requestId: string): Promise<void> {
	configureFal();

	await fal.queue.cancel(FAL_ROTATION_8DIR_WORKFLOW_ID, { requestId });
}

const FAL_SINGLE_VIEW_WORKFLOW_ID = 'workflows/P5ina/rotate-one-view';

// Direction angles for calculating relative rotation
export const DIRECTION_ANGLES = {
	input: 0, // Original input image (same as front)
	front: 0,
	right: 270,
	back: 180,
	left: 90,
} as const;

export type SourceDirection = keyof typeof DIRECTION_ANGLES;
export type RotationDirection = 'front' | 'right' | 'back' | 'left';

// 8-direction angles for the 8-dir rotation feature
export const DIRECTION_ANGLES_8DIR = {
	input: 0,
	n: 0,
	ne: 45,
	e: 90,
	se: 135,
	s: 180,
	sw: 225,
	w: 270,
	nw: 315,
} as const;

export type SourceDirection8Dir = keyof typeof DIRECTION_ANGLES_8DIR;
export type RotationDirection8Dir =
	'n' | 'ne' | 'e' | 'se' | 's' | 'sw' | 'w' | 'nw';

export function calculateHorizontalAngle8Dir(
	sourceDirection: SourceDirection8Dir,
	targetDirection: RotationDirection8Dir,
): number {
	const sourceAngle = DIRECTION_ANGLES_8DIR[sourceDirection];
	const targetAngle = DIRECTION_ANGLES_8DIR[targetDirection];
	let angle = targetAngle - sourceAngle;
	if (angle < 0) angle += 360;
	return angle;
}

/**
 * Calculate the horizontal angle needed to rotate from source direction to target direction
 */
export function calculateHorizontalAngle(
	sourceDirection: SourceDirection,
	targetDirection: RotationDirection,
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
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_SINGLE_VIEW_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
			elevation: params.elevation ?? 20,
			horizontal_angle: params.horizontalAngle,
		},
		webhookUrl: params.webhookUrl,
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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
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
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_SPIN_WORKFLOW_ID, {
		input: {
			image_url: params.imageUrl,
		},
		webhookUrl: params.webhookUrl,
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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
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
	webhookUrl?: string;
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
				...({ image_size: params.imageSize, output_format: 'png' } as Record<
					string,
					unknown
				>),
			},
			webhookUrl: params.webhookUrl,
		});
		return { requestId: request_id };
	}

	// Text-to-image (no reference) uses z-image/turbo
	const { request_id } = await fal.queue.submit(FAL_CONCEPT_ART_MODEL, {
		input: {
			prompt: params.prompt,
			image_size: params.imageSize as
				| 'square_hd'
				| 'square'
				| 'portrait_4_3'
				| 'portrait_16_9'
				| 'landscape_4_3'
				| 'landscape_16_9',
			num_inference_steps: 8,
			seed: params.seed,
			enable_safety_checker: true,
			output_format: 'png',
		},
		webhookUrl: params.webhookUrl,
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

	const model = hasReferenceImage
		? FAL_CONCEPT_ART_REF_MODEL
		: FAL_CONCEPT_ART_MODEL;

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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
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

	const model = hasReferenceImage
		? FAL_CONCEPT_ART_REF_MODEL
		: FAL_CONCEPT_ART_MODEL;
	await fal.queue.cancel(model, { requestId });
}

// ============================================================================
// Concept Art Restyle (two-step: preprocess → generate)
// ============================================================================

const FAL_CANNY_PREPROCESSOR = 'fal-ai/image-preprocessors/hed';
const FAL_DEPTH_PREPROCESSOR = 'fal-ai/image-preprocessors/depth-anything/v2';
const FAL_RESTYLE_CANNY_MODEL = 'fal-ai/flux-control-lora-canny';
const FAL_RESTYLE_DEPTH_MODEL = 'fal-ai/flux-control-lora-depth';

function getPreprocessorModel(method: 'canny' | 'depth') {
	return method === 'depth' ? FAL_DEPTH_PREPROCESSOR : FAL_CANNY_PREPROCESSOR;
}

/**
 * Step 1: Submit a preprocessor job to the queue (non-blocking).
 */
export async function submitPreprocessorJob(params: {
	imageUrl: string;
	method: 'canny' | 'depth';
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const model = getPreprocessorModel(params.method);

	const { request_id } = await fal.queue.submit(model, {
		input: { image_url: params.imageUrl },
		webhookUrl: params.webhookUrl,
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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
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
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const model =
		params.controlMethod === 'depth'
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
				...(params.controlMethod === 'depth'
					? { preprocess_depth: false }
					: {}),
			} as Record<string, unknown>),
		},
		webhookUrl: params.webhookUrl,
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

	const model =
		controlMethod === 'depth'
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
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error: unknown) {
		const body = (error as { body?: unknown })?.body;
		console.error('[fal.ai] Error checking restyle status:', error);
		if (body)
			console.error('[fal.ai] Error body:', JSON.stringify(body, null, 2));
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

	const model =
		controlMethod === 'depth'
			? FAL_RESTYLE_DEPTH_MODEL
			: FAL_RESTYLE_CANNY_MODEL;
	await fal.queue.cancel(model, { requestId });
}

// ============================================================================
// Animation (sprite animation via Wan 2.2 motion transfer)
// ============================================================================

const FAL_ANIMATE_MODEL = 'fal-ai/wan/v2.2-14b/animate/move';
const FAL_VIDEO_BG_REMOVAL_MODEL = 'bria/video/background-removal';
const FAL_IMAGE_BG_REMOVAL_MODEL = 'fal-ai/bria/background/remove';

interface FalAnimateOutput {
	video?: { url: string };
}

interface FalVideoBackgroundRemovalOutput {
	video?: Array<{ url: string }>;
}

interface FalImageBackgroundRemovalOutput {
	image?: { url: string };
}

/**
 * Submit an animation job for a single direction to fal.ai
 */
export async function submitAnimateJob(params: {
	imageUrl: string;
	videoUrl: string;
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_ANIMATE_MODEL, {
		input: {
			image_url: params.imageUrl,
			video_url: params.videoUrl,
		},
		webhookUrl: params.webhookUrl,
	});

	return { requestId: request_id };
}

/**
 * Get the status of an animation job from fal.ai
 */
export async function getAnimateJobStatus(requestId: string): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: { videoUrl: string };
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_ANIMATE_MODEL, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(FAL_ANIMATE_MODEL, {
				requestId,
			});

			const data = result.data as FalAnimateOutput;
			return {
				status: 'COMPLETED',
				output: data?.video?.url ? { videoUrl: data.video.url } : undefined,
			};
		}

		return {
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		const body = (error as { body?: unknown })?.body;
		console.error('[fal.ai] Error checking animate status:', error);
		if (body)
			console.error('[fal.ai] Error body:', JSON.stringify(body, null, 2));
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel an animation job on fal.ai
 */
export async function cancelAnimateJob(requestId: string): Promise<void> {
	configureFal();

	await fal.queue.cancel(FAL_ANIMATE_MODEL, { requestId });
}

/**
 * Submit a video background removal job to fal.ai
 */
export async function submitVideoBackgroundRemovalJob(params: {
	videoUrl: string;
	outputCodec?: 'vp9' | 'h264';
	refineForegroundEdges?: boolean;
	subjectIsPerson?: boolean;
	webhookUrl?: string;
}): Promise<{ requestId: string }> {
	configureFal();

	const { request_id } = await fal.queue.submit(FAL_VIDEO_BG_REMOVAL_MODEL, {
		input: {
			video_url: params.videoUrl,
			output_codec: params.outputCodec ?? 'vp9',
			refine_foreground_edges: params.refineForegroundEdges ?? true,
			subject_is_person: params.subjectIsPerson ?? true,
		},
		webhookUrl: params.webhookUrl,
	});

	return { requestId: request_id };
}

/**
 * Get the status of a video background removal job from fal.ai
 */
export async function getVideoBackgroundRemovalJobStatus(
	requestId: string,
): Promise<{
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: { videoUrl: string };
	error?: string;
}> {
	configureFal();

	try {
		const status = await fal.queue.status(FAL_VIDEO_BG_REMOVAL_MODEL, {
			requestId,
			logs: false,
		});

		if (status.status === 'COMPLETED') {
			const result = await fal.queue.result(FAL_VIDEO_BG_REMOVAL_MODEL, {
				requestId,
			});

			const data = result.data as unknown as FalVideoBackgroundRemovalOutput;
			return {
				status: 'COMPLETED',
				output: data?.video?.[0]?.url
					? { videoUrl: data.video[0].url }
					: undefined,
			};
		}

		return {
			status: status.status as
				'IN_QUEUE' | 'IN_PROGRESS' | 'FAILED' | 'CANCELLED',
		};
	} catch (error) {
		const body = (error as { body?: unknown })?.body;
		console.error('[fal.ai] Error checking video bg removal status:', error);
		if (body)
			console.error('[fal.ai] Error body:', JSON.stringify(body, null, 2));
		return {
			status: 'FAILED',
			error: error instanceof Error ? error.message : 'Unknown error',
		};
	}
}

/**
 * Cancel a video background removal job on fal.ai
 */
export async function cancelVideoBackgroundRemovalJob(
	requestId: string,
): Promise<void> {
	configureFal();

	await fal.queue.cancel(FAL_VIDEO_BG_REMOVAL_MODEL, { requestId });
}

/**
 * Remove image background using fal.ai
 */
export async function removeImageBackground(
	image: Buffer,
	retries = 2,
): Promise<Buffer> {
	configureFal();

	for (let attempt = 0; attempt <= retries; attempt++) {
		try {
			const result = await Promise.race([
				fal.subscribe(FAL_IMAGE_BG_REMOVAL_MODEL, {
					input: {
						image_url: new Blob([new Uint8Array(image)], { type: 'image/png' }),
						sync_mode: true,
					},
					logs: false,
				}),
				new Promise<never>((_, reject) =>
					setTimeout(
						() => reject(new Error('Background removal timed out after 60s')),
						60_000,
					),
				),
			]);

			const data = result.data as FalImageBackgroundRemovalOutput;
			const imageUrl = data.image?.url;
			if (!imageUrl) {
				throw new Error('Background removal did not return an image');
			}

			const response = await fetch(imageUrl);
			if (!response.ok) {
				throw new Error(
					`Failed to download background-removed frame: ${response.status}`,
				);
			}

			return Buffer.from(await response.arrayBuffer());
		} catch (err) {
			if (attempt < retries) {
				console.warn(
					`[bg-removal] attempt ${attempt + 1} failed, retrying...`,
					(err as Error).message,
				);
				continue;
			}
			throw err;
		}
	}

	throw new Error('Unreachable');
}
