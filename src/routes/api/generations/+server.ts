import { error, json } from '@sveltejs/kit';
import { and, count, desc, eq, inArray, lt } from 'drizzle-orm';
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

	const body = await request.json();

	// Support both single ID and multiple IDs
	const ids: string[] = body.ids || (body.id ? [body.id] : []);

	if (ids.length === 0) {
		error(400, 'Generation ID(s) required');
	}

	if (ids.length > 100) {
		error(400, 'Cannot delete more than 100 generations at once');
	}

	// Delete all matching generations owned by user
	const deleted = await db
		.delete(table.generation)
		.where(
			and(
				inArray(table.generation.id, ids),
				eq(table.generation.userId, locals.user.id)
			)
		)
		.returning();

	return json({ success: true, deleted: deleted.length });
};
