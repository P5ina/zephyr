/**
 * RunPod API client for submitting jobs to serverless workers.
 */

import { env } from '$env/dynamic/private';

interface RunPodJobInput {
	job_id: string;
	job_type: 'sprite' | 'texture' | 'rotation';
	blob_token: string;
	// Sprite-specific
	prompt?: string;
	width?: number;
	height?: number;
	seed?: number;
	single_object?: boolean;
	// Texture-specific (uses prompt, seed)
	// Rotation-specific
	input_image_url?: string;
	elevation?: number;
}

interface RunPodResponse {
	id: string;
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	delayTime?: number;
	executionTime?: number;
	output?: unknown;
	error?: string;
}

/**
 * Submit a job to the RunPod serverless endpoint.
 */
export async function submitJob(
	input: RunPodJobInput,
): Promise<RunPodResponse> {
	const apiKey = env.RUNPOD_API_KEY;
	const endpointId = env.RUNPOD_ENDPOINT_ID;

	if (!apiKey || !endpointId) {
		throw new Error(
			'RunPod configuration missing: RUNPOD_API_KEY or RUNPOD_ENDPOINT_ID',
		);
	}

	const response = await fetch(`https://api.runpod.ai/v2/${endpointId}/run`, {
		method: 'POST',
		headers: {
			'Content-Type': 'application/json',
			Authorization: `Bearer ${apiKey}`,
		},
		body: JSON.stringify({ input }),
	});

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`RunPod submission failed: ${response.status} ${errorText}`,
		);
	}

	return response.json();
}

/**
 * Submit a sprite generation job.
 */
export async function submitSpriteJob(params: {
	jobId: string;
	prompt: string;
	width: number;
	height: number;
	seed?: number;
	singleObject?: boolean;
}): Promise<RunPodResponse> {
	return submitJob({
		job_id: params.jobId,
		job_type: 'sprite',
		blob_token: env.BLOB_READ_WRITE_TOKEN || '',
		prompt: params.prompt,
		width: params.width,
		height: params.height,
		seed: params.seed,
		single_object: params.singleObject ?? true,
	});
}

/**
 * Submit a texture generation job.
 */
export async function submitTextureJob(params: {
	jobId: string;
	prompt: string;
	seed?: number;
}): Promise<RunPodResponse> {
	return submitJob({
		job_id: params.jobId,
		job_type: 'texture',
		blob_token: env.BLOB_READ_WRITE_TOKEN || '',
		prompt: params.prompt,
		seed: params.seed,
	});
}

/**
 * Submit a rotation job.
 */
export async function submitRotationJob(params: {
	jobId: string;
	inputImageUrl: string;
	elevation: number;
}): Promise<RunPodResponse> {
	return submitJob({
		job_id: params.jobId,
		job_type: 'rotation',
		blob_token: env.BLOB_READ_WRITE_TOKEN || '',
		input_image_url: params.inputImageUrl,
		elevation: params.elevation,
	});
}

/**
 * Check the status of a RunPod job.
 */
export async function getJobStatus(
	runpodJobId: string,
): Promise<RunPodResponse> {
	const apiKey = env.RUNPOD_API_KEY;
	const endpointId = env.RUNPOD_ENDPOINT_ID;

	if (!apiKey || !endpointId) {
		throw new Error('RunPod configuration missing');
	}

	const response = await fetch(
		`https://api.runpod.ai/v2/${endpointId}/status/${runpodJobId}`,
		{
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		},
	);

	if (!response.ok) {
		// Job no longer exists on RunPod (purged after completion/expiry)
		// Return as FAILED so status endpoints can refund and mark appropriately
		return {
			id: runpodJobId,
			status: 'FAILED',
			error: 'Job no longer exists on RunPod',
		};
	}

	return response.json();
}

/**
 * Cancel a RunPod job.
 */
export async function cancelJob(runpodJobId: string): Promise<void> {
	const apiKey = env.RUNPOD_API_KEY;
	const endpointId = env.RUNPOD_ENDPOINT_ID;

	if (!apiKey || !endpointId) {
		throw new Error('RunPod configuration missing');
	}

	const response = await fetch(
		`https://api.runpod.ai/v2/${endpointId}/cancel/${runpodJobId}`,
		{
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
			},
		},
	);

	if (!response.ok) {
		const errorText = await response.text();
		throw new Error(
			`RunPod cancellation failed: ${response.status} ${errorText}`,
		);
	}
}
