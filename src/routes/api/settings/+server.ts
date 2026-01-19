import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

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
