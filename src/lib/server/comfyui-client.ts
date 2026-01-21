import { env } from '$env/dynamic/private';
import spriteWorkflow from '$lib/workflows/sprite.json';
import rotateWorkflow from '$lib/workflows/rotate_regular.json';

// ComfyUI connection config
const COMFYUI_URL = env.COMFYUI_URL || 'https://cod-pam-citations-industries.trycloudflare.com';
const COMFYUI_TOKEN = env.COMFYUI_TOKEN || '';

// Progress stages for rotate workflow with estimated durations (seconds) and cumulative progress
export const ROTATE_STAGES = [
	{ name: 'Generating image', duration: 15, progressEnd: 15 },
	{ name: 'Removing background', duration: 3, progressEnd: 18 },
	{ name: 'Loading 3D model', duration: 5, progressEnd: 23 },
	{ name: 'Creating 3D mesh', duration: 35, progressEnd: 58 },
	{ name: 'Rendering 8 directions', duration: 10, progressEnd: 68 },
	{ name: 'Refining N direction', duration: 5, progressEnd: 72 },
	{ name: 'Refining NE direction', duration: 5, progressEnd: 76 },
	{ name: 'Refining E direction', duration: 5, progressEnd: 80 },
	{ name: 'Refining SE direction', duration: 5, progressEnd: 84 },
	{ name: 'Refining S direction', duration: 5, progressEnd: 88 },
	{ name: 'Refining SW direction', duration: 5, progressEnd: 92 },
	{ name: 'Refining W direction', duration: 5, progressEnd: 96 },
	{ name: 'Refining NW direction', duration: 5, progressEnd: 100 },
] as const;

export const TOTAL_ESTIMATED_DURATION = ROTATE_STAGES.reduce((sum, s) => sum + s.duration, 0);

export interface ProgressInfo {
	progress: number;
	stage: string;
	estimatedTimeRemaining: number;
}

export function estimateProgress(elapsedSeconds: number): ProgressInfo {
	let cumulativeTime = 0;

	for (const stage of ROTATE_STAGES) {
		cumulativeTime += stage.duration;
		if (elapsedSeconds < cumulativeTime) {
			// We're in this stage
			const stageStart = cumulativeTime - stage.duration;
			const stageProgress = (elapsedSeconds - stageStart) / stage.duration;
			const prevEnd = ROTATE_STAGES[ROTATE_STAGES.indexOf(stage) - 1]?.progressEnd ?? 0;
			const progress = Math.min(99, Math.round(prevEnd + stageProgress * (stage.progressEnd - prevEnd)));
			const remaining = Math.max(0, TOTAL_ESTIMATED_DURATION - elapsedSeconds);

			return {
				progress,
				stage: stage.name,
				estimatedTimeRemaining: remaining,
			};
		}
	}

	// Past estimated time, still processing
	return {
		progress: 99,
		stage: 'Finalizing...',
		estimatedTimeRemaining: 0,
	};
}

export type WorkflowType = 'sprite';
export type RotationWorkflowType = 'rotate_regular' | 'rotate_pixel';

export interface GenerateParams {
	workflow: WorkflowType;
	prompt: string;
	width?: number;
	height?: number;
	seed?: number;
	guidance?: number;
	steps?: number;
}

export interface GenerateResult {
	success: boolean;
	imageUrl?: string;
	imageData?: Buffer;
	seed?: number;
	error?: string;
}

interface ComfyUIWorkflow {
	[nodeId: string]: {
		class_type: string;
		inputs: Record<string, unknown>;
	};
}

// Store auth cookie after first request
let authCookie: string | null = null;

async function comfyFetch(
	endpoint: string,
	options: RequestInit = {},
): Promise<Response> {
	const url = `${COMFYUI_URL}${endpoint}`;

	console.log(`[ComfyUI] Fetching: ${url}`);

	const headers: Record<string, string> = {
		'ngrok-skip-browser-warning': 'true',
		'User-Agent': 'Zephyr/1.0',
		...options.headers as Record<string, string>,
	};

	// Add auth cookie if we have one
	if (authCookie) {
		headers['Cookie'] = authCookie;
		console.log(`[ComfyUI] Using auth cookie`);
	}

	let response: Response;
	try {
		response = await fetch(url, {
			...options,
			headers,
			redirect: 'manual', // Handle redirects manually to capture cookies
		});
		console.log(`[ComfyUI] Response status: ${response.status} ${response.statusText}`);
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		console.error(`[ComfyUI] Fetch error: ${msg}`);
		throw new Error(`ComfyUI connection failed: ${msg}`);
	}

	// If 302, we need to authenticate with token (only if token is set)
	if ((response.status === 302 || response.status === 401) && COMFYUI_TOKEN) {
		console.log(`[ComfyUI] Got ${response.status}, need to authenticate`);
		return await authenticateAndRetry(endpoint, options);
	}

	return response;
}

async function authenticateAndRetry(
	endpoint: string,
	options: RequestInit = {},
): Promise<Response> {
	// First request with token to get auth cookie
	const authUrl = `${COMFYUI_URL}/?token=${COMFYUI_TOKEN}`;
	console.log(`[ComfyUI] Authenticating at: ${authUrl}`);

	const authResponse = await fetch(authUrl, {
		redirect: 'manual',
		headers: {
			'ngrok-skip-browser-warning': 'true',
			'User-Agent': 'Zephyr/1.0',
		},
	});
	console.log(`[ComfyUI] Auth response: ${authResponse.status}`);

	// Extract Set-Cookie header
	const setCookie = authResponse.headers.get('set-cookie');
	if (setCookie) {
		// Extract just the cookie value (before the first semicolon)
		authCookie = setCookie.split(';')[0];
		console.log(`[ComfyUI] Got auth cookie: ${authCookie?.substring(0, 30)}...`);
	} else {
		console.log(`[ComfyUI] No Set-Cookie header received`);
	}

	// Retry original request with cookie
	const headers: Record<string, string> = {
		'ngrok-skip-browser-warning': 'true',
		'User-Agent': 'Zephyr/1.0',
		...options.headers as Record<string, string>,
	};
	if (authCookie) {
		headers['Cookie'] = authCookie;
	}

	console.log(`[ComfyUI] Retrying: ${COMFYUI_URL}${endpoint}`);
	const retryResponse = await fetch(`${COMFYUI_URL}${endpoint}`, {
		...options,
		headers,
	});
	console.log(`[ComfyUI] Retry response: ${retryResponse.status}`);

	return retryResponse;
}

export async function checkHealth(): Promise<boolean> {
	console.log(`[ComfyUI] Health check starting... URL: ${COMFYUI_URL}`);
	try {
		const res = await comfyFetch('/system_stats');
		if (!res.ok) {
			const text = await res.text();
			console.error(`[ComfyUI] Health check failed: ${res.status} - ${text.substring(0, 200)}`);
		} else {
			console.log(`[ComfyUI] Health check OK`);
		}
		return res.ok;
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		console.error(`[ComfyUI] Health check error: ${msg}`);
		return false;
	}
}

export async function waitForHealthy(
	timeout: number = 180000,
	pollInterval: number = 5000,
): Promise<boolean> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		if (await checkHealth()) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	return false;
}

const WORKFLOWS: Record<WorkflowType, ComfyUIWorkflow> = {
	sprite: spriteWorkflow as ComfyUIWorkflow,
};

// Prompt templates for different asset types
const PROMPT_TEMPLATES: Record<WorkflowType, { prefix: string; suffix: string }> = {
	sprite: {
		prefix: '',
		suffix: ', white background, isolated, single object',
	},
};

function buildPrompt(workflow: WorkflowType, userPrompt: string): string {
	const template = PROMPT_TEMPLATES[workflow];
	if (!template) return userPrompt;
	return `${template.prefix}${userPrompt}${template.suffix}`;
}

function applyParams(workflow: ComfyUIWorkflow, params: GenerateParams): ComfyUIWorkflow {
	const wf = JSON.parse(JSON.stringify(workflow)) as ComfyUIWorkflow;
	const finalPrompt = buildPrompt(params.workflow, params.prompt);

	for (const [nodeId, node] of Object.entries(wf)) {
		const classType = node.class_type;
		const inputs = node.inputs;

		// Set prompt
		if (classType === 'CLIPTextEncode' && 'text' in inputs) {
			inputs.text = finalPrompt;
		}

		// Set dimensions
		if (classType === 'EmptySD3LatentImage' || classType === 'EmptyLatentImage') {
			if ('width' in inputs) inputs.width = params.width || 1024;
			if ('height' in inputs) inputs.height = params.height || 1024;
		}

		// Set sampler params
		if (classType === 'KSampler') {
			if ('seed' in inputs) {
				inputs.seed = params.seed ?? Math.floor(Math.random() * 2 ** 32);
			}
			if ('steps' in inputs && params.steps) {
				inputs.steps = params.steps;
			}
		}

		// Set FLUX guidance
		if (classType === 'FluxGuidance' && 'guidance' in inputs) {
			inputs.guidance = params.guidance || 3.5;
		}
	}

	return wf;
}

async function queuePrompt(workflow: ComfyUIWorkflow): Promise<string> {
	const res = await comfyFetch('/prompt', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt: workflow }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`ComfyUI queue error ${res.status}: ${text}`);
	}

	const data = await res.json() as { prompt_id: string };
	return data.prompt_id;
}

interface HistoryOutput {
	images?: Array<{
		filename: string;
		subfolder: string;
		type: string;
	}>;
}

interface HistoryMessage {
	0: string; // message type
	1: {
		prompt_id?: string;
		node_id?: string;
		node_type?: string;
		exception_message?: string;
		exception_type?: string;
	};
}

interface HistoryEntry {
	outputs: Record<string, HistoryOutput>;
	status?: {
		completed: boolean;
		status_str: string;
		messages?: HistoryMessage[];
	};
}

async function getHistory(promptId: string): Promise<HistoryEntry | null> {
	const res = await comfyFetch(`/history/${promptId}`);

	if (!res.ok) {
		return null;
	}

	const data = await res.json() as Record<string, HistoryEntry>;
	return data[promptId] || null;
}

async function waitForCompletion(
	promptId: string,
	timeout: number = 120000,
	pollInterval: number = 1000,
): Promise<HistoryEntry> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		const history = await getHistory(promptId);

		if (history?.status?.status_str === 'error') {
			// Extract error details from messages
			const errorMsg = history.status.messages?.find(
				(m) => m[0] === 'execution_error'
			);
			if (errorMsg) {
				const details = errorMsg[1];
				const nodeInfo = details.node_type ? ` in ${details.node_type}` : '';
				const errText = details.exception_message || 'Unknown execution error';
				throw new Error(`Workflow error${nodeInfo}: ${errText}`);
			}
			throw new Error('Workflow execution failed');
		}

		if (history?.status?.completed) {
			return history;
		}

		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	throw new Error(`Generation timeout after ${timeout / 1000}s`);
}

async function getImage(
	filename: string,
	subfolder: string = '',
	type: string = 'output',
): Promise<Buffer> {
	const params = new URLSearchParams({ filename, subfolder, type });
	const res = await comfyFetch(`/view?${params}`);

	if (!res.ok) {
		throw new Error(`Failed to fetch image: ${res.status}`);
	}

	const arrayBuffer = await res.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

// Upload image to ComfyUI
export async function uploadImage(
	imageData: Buffer,
	filename: string,
): Promise<{ name: string; subfolder: string; type: string }> {
	const formData = new FormData();
	const uint8Array = new Uint8Array(imageData);
	const blob = new Blob([uint8Array], { type: 'image/png' });
	formData.append('image', blob, filename);

	const res = await comfyFetch('/upload/image', {
		method: 'POST',
		body: formData,
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Failed to upload image: ${res.status} - ${text}`);
	}

	return await res.json();
}

// Rotation generation result
export interface RotateResult {
	success: boolean;
	images?: {
		n?: Buffer;
		ne?: Buffer;
		e?: Buffer;
		se?: Buffer;
		s?: Buffer;
		sw?: Buffer;
		w?: Buffer;
		nw?: Buffer;
	};
	error?: string;
}

export interface RotateParams {
	workflow: RotationWorkflowType;
	prompt: string;
	seed?: number;
	pixelResolution?: number;
	colorCount?: number;
}

// Map of SaveImage node IDs to directions
const ROTATION_OUTPUT_NODES: Record<string, string> = {
	'69': 'n',   // sprite_N
	'40': 'ne',  // sprite_NE
	'41': 'e',   // sprite_E
	'42': 'se',  // sprite_SE
	'43': 's',   // sprite_S
	'53': 'sw',  // sprite_SW
	'54': 'w',   // sprite_W
	'55': 'nw',  // sprite_NW
};

// Generate rotations using TripoSR workflow
export async function generateRotations(params: RotateParams): Promise<RotateResult> {
	try {
		// Clone the workflow
		const workflow = JSON.parse(JSON.stringify(rotateWorkflow)) as ComfyUIWorkflow;

		// Set the prompt (node 61 is PrimitiveStringMultiline for prompt)
		if (workflow['61']?.inputs) {
			workflow['61'].inputs.value = params.prompt;
		}

		// Set seed (node 56 is PrimitiveInt for seed)
		if (workflow['56']?.inputs) {
			workflow['56'].inputs.value = params.seed ?? Math.floor(Math.random() * 2 ** 32);
		}

		console.log(`[Rotate] Queuing workflow with prompt: "${params.prompt.substring(0, 50)}..."`);
		const promptId = await queuePrompt(workflow);
		console.log(`[Rotate] Prompt ID: ${promptId}`);

		// Wait for completion (longer timeout for 3D processing + 8 ControlNet passes)
		const history = await waitForCompletion(promptId, 600000, 3000);
		console.log(`[Rotate] Workflow completed`);

		// Extract images from outputs
		const images: RotateResult['images'] = {};

		for (const [nodeId, output] of Object.entries(history.outputs)) {
			const direction = ROTATION_OUTPUT_NODES[nodeId];
			if (direction && output.images && output.images.length > 0) {
				const img = output.images[0];
				const imageData = await getImage(img.filename, img.subfolder, img.type);
				images[direction as keyof typeof images] = imageData;
				console.log(`[Rotate] Got ${direction.toUpperCase()} image`);
			}
		}

		const imageCount = Object.keys(images).length;
		if (imageCount === 0) {
			return { success: false, error: 'No rotation images generated' };
		}

		console.log(`[Rotate] Generated ${imageCount} rotation images`);
		return { success: true, images };

	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		console.error(`[Rotate] Error: ${message}`);
		return { success: false, error: message };
	}
}

export async function generate(params: GenerateParams): Promise<GenerateResult> {
	try {
		// Get workflow template
		const template = WORKFLOWS[params.workflow];
		if (!template) {
			return { success: false, error: `Unknown workflow: ${params.workflow}` };
		}

		// Apply parameters
		const workflow = applyParams(template, params);

		// Queue the prompt
		const promptId = await queuePrompt(workflow);

		// Wait for completion
		const history = await waitForCompletion(promptId);

		// Extract images from outputs
		const images: Array<{ filename: string; subfolder: string; type: string }> = [];
		for (const output of Object.values(history.outputs)) {
			if (output.images) {
				images.push(...output.images);
			}
		}

		if (images.length === 0) {
			return { success: false, error: 'No images generated' };
		}

		// Get the first image
		const img = images[0];
		const imageData = await getImage(img.filename, img.subfolder, img.type);

		// Build image URL for direct access
		const imageUrl = `${COMFYUI_URL}/view?filename=${encodeURIComponent(img.filename)}&subfolder=${encodeURIComponent(img.subfolder)}&type=${encodeURIComponent(img.type)}&token=${COMFYUI_TOKEN}`;

		return {
			success: true,
			imageUrl,
			imageData,
			seed: params.seed,
		};
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		return { success: false, error: message };
	}
}
