import { error, json } from '@sveltejs/kit';
import { and, count, desc, eq, lt } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const limit = Math.min(parseInt(url.searchParams.get('limit') || '20'), 100);
	const cursor = url.searchParams.get('cursor');

	const conditions = [eq(table.generation.userId, locals.user.id)];

	if (cursor) {
		const cursorGeneration = await db.query.generation.findFirst({
			where: eq(table.generation.id, cursor),
		});
		if (cursorGeneration) {
			conditions.push(
				lt(table.generation.createdAt, cursorGeneration.createdAt),
			);
		}
	}

	const generations = await db.query.generation.findMany({
		where:
			conditions.length > 1
				? (g, { and }) => and(...conditions.map((c) => c))
				: conditions[0],
		orderBy: desc(table.generation.createdAt),
		limit: limit + 1,
	});

	const hasMore = generations.length > limit;
	const items = hasMore ? generations.slice(0, -1) : generations;
	const nextCursor = hasMore ? items[items.length - 1]?.id : null;

	const [totalResult] = await db
		.select({ count: count() })
		.from(table.generation)
		.where(eq(table.generation.userId, locals.user.id));

	return json({
		generations: items,
		nextCursor,
		total: totalResult?.count ?? 0,
	});
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const { id } = await request.json();

	if (!id || typeof id !== 'string') {
		error(400, 'Generation ID is required');
	}

	// Verify ownership and delete
	const [deleted] = await db
		.delete(table.generation)
		.where(
			and(
				eq(table.generation.id, id),
				eq(table.generation.userId, locals.user.id)
			)
		)
		.returning();

	if (!deleted) {
		error(404, 'Generation not found');
	}

	return json({ success: true });
};
