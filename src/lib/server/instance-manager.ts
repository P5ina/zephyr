import { env } from '$env/dynamic/private';
import { eq, and, or, lt, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import {
	searchOffers,
	createInstance,
	getInstance,
	destroyInstance,
	getHttpEndpoint,
	type VastInstance as VastAPIInstance,
} from './vast';
import { waitForHealthy } from './comfyui-client';

const VAST_DOCKER_IMAGE = env.VAST_DOCKER_IMAGE || 'your-docker-hub/comfyui-worker:latest';
const VAST_IDLE_TIMEOUT = parseInt(env.VAST_IDLE_TIMEOUT || '600', 10) * 1000; // ms
const VAST_GPU_MIN_RAM = parseInt(env.VAST_GPU_MIN_RAM || '24', 10);

export interface ManagedInstance {
	id: string;
	status: table.VastInstance['status'];
	httpHost: string | null;
	httpPort: number | null;
}

export async function getOrCreateInstance(): Promise<ManagedInstance> {
	// First, check for an existing ready instance
	const existing = await db.query.vastInstance.findFirst({
		where: or(
			eq(table.vastInstance.status, 'ready'),
			eq(table.vastInstance.status, 'starting'),
			eq(table.vastInstance.status, 'creating'),
		),
	});

	if (existing) {
		// If it's ready, mark it as busy
		if (existing.status === 'ready') {
			await db
				.update(table.vastInstance)
				.set({
					status: 'busy',
					lastActivityAt: new Date(),
				})
				.where(eq(table.vastInstance.id, existing.id));

			return {
				id: existing.id,
				status: 'busy',
				httpHost: existing.httpHost,
				httpPort: existing.httpPort,
			};
		}

		// If it's still creating/starting, return as-is
		return {
			id: existing.id,
			status: existing.status,
			httpHost: existing.httpHost,
			httpPort: existing.httpPort,
		};
	}

	// No existing instance, create a new one
	return await createNewInstance();
}

async function createNewInstance(): Promise<ManagedInstance> {
	// Search for available offers
	const offers = await searchOffers({
		minGpuRam: VAST_GPU_MIN_RAM,
		maxDph: 1.0,
		minReliability: 0.95,
	});

	if (offers.length === 0) {
		throw new Error('No suitable GPU offers available');
	}

	// Pick the cheapest offer
	const offer = offers[0];

	// Create the instance
	const result = await createInstance({
		offerId: offer.id,
		dockerImage: VAST_DOCKER_IMAGE,
		disk: 100, // Need space for Docker image + models (~50GB)
		env: {
			COMFYUI_PORT: '8188',
		},
	});

	const instanceId = result.new_contract.toString();

	// Record in database
	await db.insert(table.vastInstance).values({
		id: instanceId,
		status: 'creating',
		gpuName: offer.gpu_name,
		costPerHour: offer.dph_total.toFixed(4),
		createdAt: new Date(),
	});

	// Start background task to wait for instance to be ready
	waitForInstanceReady(instanceId);

	return {
		id: instanceId,
		status: 'creating',
		httpHost: null,
		httpPort: null,
	};
}

async function waitForInstanceReady(instanceId: string): Promise<void> {
	const maxWaitTime = 300000; // 5 minutes
	const pollInterval = 10000; // 10 seconds
	const start = Date.now();

	try {
		// Wait for Vast.ai to report instance as running
		let vastInstance: VastAPIInstance | null = null;

		while (Date.now() - start < maxWaitTime) {
			vastInstance = await getInstance(parseInt(instanceId, 10));

			if (!vastInstance) {
				throw new Error('Instance not found');
			}

			if (vastInstance.actual_status === 'running') {
				break;
			}

			if (vastInstance.actual_status === 'exited' || vastInstance.actual_status === 'offline') {
				throw new Error(`Instance failed to start: ${vastInstance.actual_status}`);
			}

			await new Promise((resolve) => setTimeout(resolve, pollInterval));
		}

		if (!vastInstance || vastInstance.actual_status !== 'running') {
			throw new Error('Instance startup timeout');
		}

		// Get HTTP endpoint
		const endpoint = getHttpEndpoint(vastInstance);
		if (!endpoint) {
			throw new Error('Could not determine HTTP endpoint');
		}

		// Update database with connection info
		await db
			.update(table.vastInstance)
			.set({
				status: 'starting',
				httpHost: endpoint.host,
				httpPort: endpoint.port,
			})
			.where(eq(table.vastInstance.id, instanceId));

		// Wait for ComfyUI to be healthy
		const healthy = await waitForHealthy(endpoint.host, endpoint.port, 180000);

		if (!healthy) {
			throw new Error('ComfyUI health check failed');
		}

		// Instance is ready
		await db
			.update(table.vastInstance)
			.set({
				status: 'ready',
				lastActivityAt: new Date(),
			})
			.where(eq(table.vastInstance.id, instanceId));
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Unknown error';
		await markInstanceFailed(instanceId, message);
	}
}

export async function releaseInstance(instanceId: string): Promise<void> {
	await db
		.update(table.vastInstance)
		.set({
			status: 'ready',
			currentJobId: null,
			lastActivityAt: new Date(),
		})
		.where(eq(table.vastInstance.id, instanceId));
}

export async function markInstanceFailed(instanceId: string, error: string): Promise<void> {
	await db
		.update(table.vastInstance)
		.set({
			status: 'failed',
			errorMessage: error,
		})
		.where(eq(table.vastInstance.id, instanceId));

	// Try to destroy the instance on Vast.ai
	try {
		await destroyInstance(parseInt(instanceId, 10));
	} catch {
		// Ignore cleanup errors
	}
}

export async function destroyIdleInstances(): Promise<number> {
	const cutoff = new Date(Date.now() - VAST_IDLE_TIMEOUT);

	// Find idle instances
	const idleInstances = await db.query.vastInstance.findMany({
		where: and(
			eq(table.vastInstance.status, 'ready'),
			or(lt(table.vastInstance.lastActivityAt, cutoff), isNull(table.vastInstance.lastActivityAt)),
		),
	});

	let destroyed = 0;

	for (const instance of idleInstances) {
		try {
			await db
				.update(table.vastInstance)
				.set({ status: 'stopping' })
				.where(eq(table.vastInstance.id, instance.id));

			await destroyInstance(parseInt(instance.id, 10));

			await db
				.update(table.vastInstance)
				.set({ status: 'stopped' })
				.where(eq(table.vastInstance.id, instance.id));

			destroyed++;
		} catch (err) {
			console.error(`Failed to destroy instance ${instance.id}:`, err);
		}
	}

	return destroyed;
}

export async function cleanupFailedInstances(): Promise<number> {
	const failedInstances = await db.query.vastInstance.findMany({
		where: eq(table.vastInstance.status, 'failed'),
	});

	let cleaned = 0;

	for (const instance of failedInstances) {
		try {
			await destroyInstance(parseInt(instance.id, 10));
		} catch {
			// Instance may already be destroyed
		}

		await db
			.update(table.vastInstance)
			.set({ status: 'stopped' })
			.where(eq(table.vastInstance.id, instance.id));

		cleaned++;
	}

	return cleaned;
}

export async function getCurrentInstance(): Promise<ManagedInstance | null> {
	const instance = await db.query.vastInstance.findFirst({
		where: or(
			eq(table.vastInstance.status, 'ready'),
			eq(table.vastInstance.status, 'busy'),
			eq(table.vastInstance.status, 'starting'),
			eq(table.vastInstance.status, 'creating'),
		),
	});

	if (!instance) {
		return null;
	}

	return {
		id: instance.id,
		status: instance.status,
		httpHost: instance.httpHost,
		httpPort: instance.httpPort,
	};
}

export async function healthCheck(instanceId: string): Promise<boolean> {
	const instance = await db.query.vastInstance.findFirst({
		where: eq(table.vastInstance.id, instanceId),
	});

	if (!instance || !instance.httpHost || !instance.httpPort) {
		return false;
	}

	const { checkHealth } = await import('./comfyui-client');
	return checkHealth(instance.httpHost, instance.httpPort);
}
