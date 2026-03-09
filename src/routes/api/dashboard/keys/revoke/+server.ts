import { error, json } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const { keyId } = await request.json();
	if (!keyId) {
		error(400, 'Missing keyId');
	}

	const [updated] = await db
		.update(table.apiKey)
		.set({ revokedAt: new Date() })
		.where(
			and(eq(table.apiKey.id, keyId), eq(table.apiKey.userId, locals.user.id)),
		)
		.returning();

	if (!updated) {
		error(404, 'Key not found');
	}

	return json({ success: true });
};
