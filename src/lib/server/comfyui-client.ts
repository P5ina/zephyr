export interface ComfyUIWorkflow {
	[nodeId: string]: {
		class_type: string;
		inputs: Record<string, unknown>;
	};
}

export interface ComfyUIOutput {
	images?: Array<{
		filename: string;
		subfolder: string;
		type: string;
	}>;
}

export interface ComfyUIHistory {
	prompt: unknown[];
	outputs: Record<string, ComfyUIOutput>;
	status: {
		status_str: string;
		completed: boolean;
		messages: Array<[string, unknown]>;
	};
}

async function comfyFetch(
	host: string,
	port: number,
	endpoint: string,
	options: RequestInit = {},
): Promise<Response> {
	const url = `http://${host}:${port}${endpoint}`;
	const controller = new AbortController();
	const timeout = setTimeout(() => controller.abort(), 30000);

	try {
		const res = await fetch(url, {
			...options,
			signal: controller.signal,
		});
		return res;
	} finally {
		clearTimeout(timeout);
	}
}

export async function queuePrompt(
	host: string,
	port: number,
	workflow: ComfyUIWorkflow,
): Promise<string> {
	const res = await comfyFetch(host, port, '/prompt', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ prompt: workflow }),
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`ComfyUI queue error ${res.status}: ${text}`);
	}

	const data = (await res.json()) as { prompt_id: string };
	return data.prompt_id;
}

export async function getHistory(
	host: string,
	port: number,
	promptId: string,
): Promise<ComfyUIHistory | null> {
	const res = await comfyFetch(host, port, `/history/${promptId}`);

	if (!res.ok) {
		return null;
	}

	const data = (await res.json()) as Record<string, ComfyUIHistory>;
	return data[promptId] || null;
}

export async function getImage(
	host: string,
	port: number,
	filename: string,
	subfolder: string,
	type: string,
): Promise<Buffer> {
	const params = new URLSearchParams({ filename, subfolder, type });
	const res = await comfyFetch(host, port, `/view?${params}`);

	if (!res.ok) {
		throw new Error(`Failed to fetch image: ${res.status}`);
	}

	const arrayBuffer = await res.arrayBuffer();
	return Buffer.from(arrayBuffer);
}

export interface WaitResult {
	success: boolean;
	history?: ComfyUIHistory;
	error?: string;
}

export async function waitForCompletion(
	host: string,
	port: number,
	promptId: string,
	timeout: number = 300000, // 5 minutes default
	pollInterval: number = 1000,
): Promise<WaitResult> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		try {
			const history = await getHistory(host, port, promptId);

			if (history && history.status?.completed) {
				return { success: true, history };
			}

			// Check for errors in status messages
			if (history?.status?.messages) {
				for (const [type, _data] of history.status.messages) {
					if (type === 'execution_error') {
						return {
							success: false,
							error: 'Workflow execution error',
							history,
						};
					}
				}
			}
		} catch (err) {
			// Transient errors during polling are okay, keep trying
			console.error('Polling error:', err);
		}

		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	return { success: false, error: 'Timeout waiting for completion' };
}

export async function checkHealth(host: string, port: number): Promise<boolean> {
	try {
		const res = await comfyFetch(host, port, '/system_stats');
		return res.ok;
	} catch {
		return false;
	}
}

export async function waitForHealthy(
	host: string,
	port: number,
	timeout: number = 180000, // 3 minutes default
	pollInterval: number = 5000,
): Promise<boolean> {
	const start = Date.now();

	while (Date.now() - start < timeout) {
		if (await checkHealth(host, port)) {
			return true;
		}
		await new Promise((resolve) => setTimeout(resolve, pollInterval));
	}

	return false;
}

export interface WorkflowParams {
	assetType: 'sprite' | 'pixel_art' | 'texture';
	prompt: string;
	negativePrompt?: string;
	width?: number;
	height?: number;
	seed?: number;
}

// Workflow templates - these match the workflow JSON files
const WORKFLOW_TEMPLATES: Record<string, ComfyUIWorkflow> = {
	sprite: {
		positive_prompt: {
			class_type: 'CLIPTextEncode',
			inputs: { text: '', clip: ['clip_loader', 0] },
		},
		negative_prompt: {
			class_type: 'CLIPTextEncode',
			inputs: { text: '', clip: ['clip_loader', 0] },
		},
		latent: {
			class_type: 'EmptyLatentImage',
			inputs: { width: 512, height: 512, batch_size: 1 },
		},
		sampler: {
			class_type: 'KSampler',
			inputs: {
				seed: -1,
				steps: 20,
				cfg: 7,
				sampler_name: 'euler',
				scheduler: 'normal',
				denoise: 1,
				model: ['model_loader', 0],
				positive: ['positive_prompt', 0],
				negative: ['negative_prompt', 0],
				latent_image: ['latent', 0],
			},
		},
		decoder: {
			class_type: 'VAEDecode',
			inputs: { samples: ['sampler', 0], vae: ['vae_loader', 0] },
		},
		save: {
			class_type: 'SaveImage',
			inputs: { filename_prefix: 'output', images: ['decoder', 0] },
		},
		model_loader: {
			class_type: 'CheckpointLoaderSimple',
			inputs: { ckpt_name: 'flux/schnell' },
		},
		clip_loader: {
			class_type: 'CLIPLoader',
			inputs: { clip_name: 'flux/schnell' },
		},
		vae_loader: {
			class_type: 'VAELoader',
			inputs: { vae_name: 'flux/schnell' },
		},
	},
};

export function buildWorkflow(params: WorkflowParams): ComfyUIWorkflow {
	// For now, use sprite template for all types (can be expanded later)
	const template = structuredClone(WORKFLOW_TEMPLATES.sprite);

	// Inject parameters
	template.positive_prompt.inputs.text = params.prompt;
	template.negative_prompt.inputs.text = params.negativePrompt || '';
	template.latent.inputs.width = params.width || 512;
	template.latent.inputs.height = params.height || 512;

	if (params.seed !== undefined && params.seed !== -1) {
		template.sampler.inputs.seed = params.seed;
	} else {
		template.sampler.inputs.seed = Math.floor(Math.random() * 2147483647);
	}

	return template;
}
