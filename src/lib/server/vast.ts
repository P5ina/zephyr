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

	// Build query string for Vast.ai search
	const query: Record<string, unknown> = {
		verified: { eq: true },
		rentable: { eq: true },
		gpu_ram: { gte: minGpuRam * 1024 }, // Vast uses MB
		dph_total: { lte: maxDph },
		reliability: { gte: minReliability },
		num_gpus: { eq: 1 },
		cuda_vers: { gte: 12.0 },
	};

	if (gpuNames && gpuNames.length > 0) {
		query.gpu_name = { in: gpuNames };
	}

	const response = await vastFetch<{ offers: VastOffer[] }>('/bundles', {
		method: 'POST',
		body: JSON.stringify({ q: query, order: [['dph_total', 'asc']], limit: 20 }),
	});

	return response.offers || [];
}

export interface CreateInstanceParams {
	offerId: number;
	dockerImage: string;
	disk?: number; // GB
	onstart?: string; // startup script
	env?: Record<string, string>;
}

export async function createInstance(params: CreateInstanceParams): Promise<{ new_contract: number }> {
	const { offerId, dockerImage, disk = 40, onstart, env: envVars } = params;

	const body: Record<string, unknown> = {
		client_id: 'me',
		image: dockerImage,
		disk,
		runtype: 'ssh_proxy', // Use SSH proxy for port access
	};

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
