import { env } from '$env/dynamic/private';

const VAST_API_KEY = env.VAST_API_KEY;
const VAST_API_BASE = 'https://console.vast.ai/api/v0';

export interface VastOffer {
	id: number;
	machine_id: number;
	gpu_name: string;
	gpu_ram: number;
	num_gpus: number;
	cpu_cores: number;
	cpu_ram: number;
	disk_space: number;
	dph_total: number; // dollars per hour
	inet_up: number;
	inet_down: number;
	reliability: number;
	geolocation: string;
	cuda_vers: number;
}

export interface VastInstance {
	id: number;
	machine_id: number;
	actual_status: 'running' | 'loading' | 'exited' | 'created' | 'offline';
	ssh_host: string;
	ssh_port: number;
	ports: Record<string, { HostIp: string; HostPort: string }[]>;
	gpu_name: string;
	dph_total: number;
	start_date: number;
	cur_state: string;
}

interface VastSearchParams {
	minGpuRam?: number; // GB
	maxDph?: number; // max $/hr
	minReliability?: number;
	gpuNames?: string[];
}

async function vastFetch<T>(
	endpoint: string,
	options: RequestInit = {},
): Promise<T> {
	const res = await fetch(`${VAST_API_BASE}${endpoint}`, {
		...options,
		headers: {
			Authorization: `Bearer ${VAST_API_KEY}`,
			'Content-Type': 'application/json',
			Accept: 'application/json',
			...options.headers,
		},
	});

	if (!res.ok) {
		const text = await res.text();
		throw new Error(`Vast.ai API error ${res.status}: ${text}`);
	}

	return res.json();
}

export async function searchOffers(params: VastSearchParams = {}): Promise<VastOffer[]> {
	const { minGpuRam = 24, maxDph = 1.0, minReliability = 0.95, gpuNames } = params;

	// Build query for Vast.ai search API
	const body: Record<string, unknown> = {
		verified: { eq: true },
		rentable: { eq: true },
		rented: { eq: false },
		gpu_ram: { gte: minGpuRam * 1024 }, // Vast uses MB
		disk_space: { gte: 100 }, // Minimum 100GB free disk
		dph_total: { lte: maxDph },
		reliability2: { gte: minReliability },
		num_gpus: { eq: 1 },
		cuda_max_good: { gte: 12.0 },
		type: 'on-demand',
		limit: 20,
		order: [['dph_total', 'asc']],
	};

	if (gpuNames && gpuNames.length > 0) {
		body.gpu_name = { in: gpuNames };
	}

	const response = await vastFetch<{ offers: VastOffer[] }>('/bundles/', {
		method: 'POST',
		body: JSON.stringify(body),
	});

	return response.offers || [];
}

export interface CreateInstanceParams {
	offerId: number;
	templateId?: string;
	dockerImage?: string;
	disk?: number; // GB
	onstart?: string; // startup script
	env?: Record<string, string>;
}

export async function createInstance(params: CreateInstanceParams): Promise<{ new_contract: number }> {
	const { offerId, templateId, dockerImage, disk = 100, onstart, env: envVars } = params;

	const body: Record<string, unknown> = {
		client_id: 'me',
		disk,
	};

	// Use template if provided, otherwise use Docker image
	if (templateId) {
		body.template_hash = templateId;
	} else if (dockerImage) {
		body.image = dockerImage;
		body.runtype = 'ssh_proxy';
	}

	if (onstart) {
		body.onstart = onstart;
	}

	if (envVars) {
		body.env = envVars;
	}

	return vastFetch<{ new_contract: number }>(`/asks/${offerId}/`, {
		method: 'PUT',
		body: JSON.stringify(body),
	});
}

export async function getInstance(instanceId: number): Promise<VastInstance | null> {
	try {
		const response = await vastFetch<{ instances: VastInstance[] }>('/instances', {
			method: 'GET',
		});

		return response.instances?.find((i) => i.id === instanceId) || null;
	} catch {
		return null;
	}
}

export async function destroyInstance(instanceId: number): Promise<void> {
	await vastFetch(`/instances/${instanceId}/`, {
		method: 'DELETE',
	});
}

export async function listInstances(): Promise<VastInstance[]> {
	const response = await vastFetch<{ instances: VastInstance[] }>('/instances', {
		method: 'GET',
	});

	return response.instances || [];
}

export function getHttpEndpoint(instance: VastInstance): { host: string; port: number } | null {
	// Look for port 8188 mapping (ComfyUI default port)
	const portMapping = instance.ports?.['8188/tcp'];
	if (!portMapping || portMapping.length === 0) {
		return null;
	}

	return {
		host: portMapping[0].HostIp || instance.ssh_host,
		port: parseInt(portMapping[0].HostPort, 10),
	};
}
