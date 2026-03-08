import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { eq, and, isNull } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	// Revoke any existing active keys
	await db
		.update(table.apiKey)
		.set({ revokedAt: new Date() })
		.where(
			and(
				eq(table.apiKey.userId, locals.user.id),
				isNull(table.apiKey.revokedAt),
			),
		);

	// Generate new key: gsk_ prefix + 40 char random
	const rawKey = `gsk_${nanoid(40)}`;
	const keyHash = encodeHexLowerCase(
		sha256(new TextEncoder().encode(rawKey)),
	);
	const keyPrefix = rawKey.slice(0, 12);

	const [newKey] = await db
		.insert(table.apiKey)
		.values({
			id: nanoid(),
			userId: locals.user.id,
			keyHash,
			keyPrefix,
		})
		.returning();

	return json({
		key: rawKey,
		id: newKey.id,
		keyPrefix: newKey.keyPrefix,
		createdAt: newKey.createdAt,
	});
};
