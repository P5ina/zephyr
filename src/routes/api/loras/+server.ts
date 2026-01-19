import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq, and, desc } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const loras = await db.query.lora.findMany({
		where: eq(table.lora.userId, locals.user.id),
		orderBy: desc(table.lora.createdAt),
	});

	return json({ loras });
};

interface CreateLoraRequest {
	name: string;
	falUrl: string;
}

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: CreateLoraRequest = await request.json();

	if (!body.name || body.name.trim().length === 0) {
		error(400, 'Name is required');
	}

	if (!body.falUrl || body.falUrl.trim().length === 0) {
		error(400, 'LoRA URL is required');
	}

	const [lora] = await db
		.insert(table.lora)
		.values({
			id: nanoid(),
			visibleId: nanoid(10),
			name: body.name.trim(),
			falUrl: body.falUrl,
			userId: locals.user.id,
		})
		.returning();

	return json({ lora });
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body: { id: string } = await request.json();

	if (!body.id) {
		error(400, 'LoRA ID is required');
	}

	await db
		.delete(table.lora)
		.where(
			and(eq(table.lora.id, body.id), eq(table.lora.userId, locals.user.id))
		);

	return json({ success: true });
};
