import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';

export const PATCH: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();

	const updates: Partial<{ nsfwEnabled: boolean }> = {};

	if (typeof body.nsfwEnabled === 'boolean') {
		updates.nsfwEnabled = body.nsfwEnabled;
	}

	if (Object.keys(updates).length === 0) {
		error(400, 'No valid fields to update');
	}

	await db
		.update(table.user)
		.set(updates)
		.where(eq(table.user.id, locals.user.id));

	return json({ success: true, ...updates });
};
