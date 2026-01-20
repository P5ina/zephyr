import { env } from '$env/dynamic/private';
import spriteWorkflow from '$lib/workflows/sprite.json';

// ComfyUI connection config
const COMFYUI_URL = env.COMFYUI_URL || 'https://cod-pam-citations-industries.trycloudflare.com';
const COMFYUI_TOKEN = env.COMFYUI_TOKEN || '';

export type WorkflowType = 'sprite';

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

	const headers: Record<string, string> = {
		...options.headers as Record<string, string>,
	};

	// Add auth cookie if we have one
	if (authCookie) {
		headers['Cookie'] = authCookie;
	}

	let response: Response;
	try {
		response = await fetch(url, {
			...options,
			headers,
			redirect: 'manual', // Handle redirects manually to capture cookies
		});
	} catch (err) {
		const msg = err instanceof Error ? err.message : 'Unknown error';
		throw new Error(`ComfyUI connection failed: ${msg}`);
	}

	// If 302, we need to authenticate with token
	if (response.status === 302 || response.status === 401) {
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
	const authResponse = await fetch(authUrl, { redirect: 'manual' });

	// Extract Set-Cookie header
	const setCookie = authResponse.headers.get('set-cookie');
	if (setCookie) {
		// Extract just the cookie value (before the first semicolon)
		authCookie = setCookie.split(';')[0];
	}

	// Retry original request with cookie
	const headers: Record<string, string> = {
		...options.headers as Record<string, string>,
	};
	if (authCookie) {
		headers['Cookie'] = authCookie;
	}

	return await fetch(`${COMFYUI_URL}${endpoint}`, {
		...options,
		headers,
	});
}

export async function checkHealth(): Promise<boolean> {
	try {
		const res = await comfyFetch('/system_stats');
		return res.ok;
	} catch {
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
