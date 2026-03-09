import { error, json } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const PUT: RequestHandler = async ({ locals, request }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = await request.json();
	const { anthropicApiKey } = body;

	if (anthropicApiKey !== null && anthropicApiKey !== '') {
		if (
			typeof anthropicApiKey !== 'string' ||
			!anthropicApiKey.startsWith('sk-ant-')
		) {
			error(400, 'Invalid Anthropic API key format. Keys start with sk-ant-');
		}
	}

	await db
		.update(table.user)
		.set({ anthropicApiKey: anthropicApiKey || null })
		.where(eq(table.user.id, locals.user.id));

	return json({ success: true });
};
