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
	singleObject?: boolean;
}): Promise<{ requestId: string }> {
	configureFal();

	const singleObject = params.singleObject ?? true;

	// Enhance prompt based on single/multiple object mode
	let enhancedPrompt: string;

	if (singleObject) {
		enhancedPrompt =
			`single ${params.prompt}, one object only, game sprite, centered, ` +
			'isolated on solid background, no other objects, digital art, high quality';
	} else {
		enhancedPrompt =
			`${params.prompt}, game sprites, arranged composition, ` +
			'solid background, digital art, high quality';
	}

	const { request_id } = await fal.queue.submit(FAL_SPRITE_WORKFLOW_ID, {
		input: {
			prompt: enhancedPrompt,
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
