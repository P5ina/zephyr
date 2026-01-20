import { error, json } from '@sveltejs/kit';
import { eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { listInstances } from '$lib/server/vast';
import type { RequestHandler } from './$types';

// Sync local database with Vast.ai instances
export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// Get all active instances from our database
	const dbInstances = await db.query.vastInstance.findMany({
		where: or(
			eq(table.vastInstance.status, 'creating'),
			eq(table.vastInstance.status, 'starting'),
			eq(table.vastInstance.status, 'ready'),
			eq(table.vastInstance.status, 'busy'),
		),
	});

	if (dbInstances.length === 0) {
		return json({ message: 'No active instances to sync', synced: 0 });
	}

	// Get all instances from Vast.ai
	let vastInstances: { id: number; actual_status: string }[] = [];
	try {
		vastInstances = await listInstances();
	} catch (err) {
		console.error('Failed to list Vast.ai instances:', err);
		error(500, 'Failed to fetch Vast.ai instances');
	}

	const vastInstanceIds = new Set(vastInstances.map((i) => i.id.toString()));

	let synced = 0;
	const results: { id: string; action: string }[] = [];

	for (const dbInstance of dbInstances) {
		// Check if instance exists on Vast.ai
		if (!vastInstanceIds.has(dbInstance.id)) {
			// Instance doesn't exist on Vast.ai, mark as stopped
			await db
				.update(table.vastInstance)
				.set({
					status: 'stopped',
					errorMessage: 'Instance not found on Vast.ai (manually deleted?)',
				})
				.where(eq(table.vastInstance.id, dbInstance.id));

			synced++;
			results.push({ id: dbInstance.id, action: 'marked_stopped' });
			continue;
		}

		// Check Vast.ai status
		const vastInstance = vastInstances.find((i) => i.id.toString() === dbInstance.id);
		if (vastInstance) {
			if (vastInstance.actual_status === 'exited' || vastInstance.actual_status === 'offline') {
				await db
					.update(table.vastInstance)
					.set({
						status: 'failed',
						errorMessage: `Vast.ai status: ${vastInstance.actual_status}`,
					})
					.where(eq(table.vastInstance.id, dbInstance.id));

				synced++;
				results.push({ id: dbInstance.id, action: `marked_failed (${vastInstance.actual_status})` });
			}
		}
	}

	return json({
		message: `Synced ${synced} instances`,
		synced,
		results,
	});
};

// Force cleanup all instances
export const DELETE: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// Mark all non-terminal instances as stopped
	const result = await db
		.update(table.vastInstance)
		.set({
			status: 'stopped',
			errorMessage: 'Force cleaned by admin',
		})
		.where(
			or(
				eq(table.vastInstance.status, 'creating'),
				eq(table.vastInstance.status, 'starting'),
				eq(table.vastInstance.status, 'ready'),
				eq(table.vastInstance.status, 'busy'),
			),
		);

	return json({
		message: 'All active instances marked as stopped',
	});
};
