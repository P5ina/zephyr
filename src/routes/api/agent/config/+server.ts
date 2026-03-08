import { json, error } from '@sveltejs/kit';
import { nanoid } from 'nanoid';
import { sha256 } from '@oslojs/crypto/sha2';
import { encodeHexLowerCase } from '@oslojs/encoding';
import { eq, and, isNull } from 'drizzle-orm';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

// In-memory rate limit store: keyHash -> last request timestamp
const rateLimitMap = new Map<string, number>();

export const GET: RequestHandler = async ({ request }) => {
	const authHeader = request.headers.get('authorization');
	if (!authHeader?.startsWith('Bearer ')) {
		error(401, 'Missing or invalid Authorization header');
	}

	const rawKey = authHeader.slice(7);
	const keyHash = encodeHexLowerCase(
		sha256(new TextEncoder().encode(rawKey)),
	);

	// Look up active key
	const [apiKeyRecord] = await db
		.select()
		.from(table.apiKey)
		.where(
			and(
				eq(table.apiKey.keyHash, keyHash),
				isNull(table.apiKey.revokedAt),
			),
		);

	if (!apiKeyRecord) {
		error(401, 'Invalid or revoked API key');
	}

	// Rate limit: 1 req/min per key
	const now = Date.now();
	const lastRequest = rateLimitMap.get(keyHash);
	if (lastRequest && now - lastRequest < 60_000) {
		error(429, 'Rate limited. Max 1 request per minute per key.');
	}
	rateLimitMap.set(keyHash, now);

	// Get user with current balance
	const [user] = await db
		.select({
			id: table.user.id,
			tokens: table.user.tokens,
			bonusTokens: table.user.bonusTokens,
		})
		.from(table.user)
		.where(eq(table.user.id, apiKeyRecord.userId));

	if (!user) {
		error(401, 'User not found');
	}

	// Update last_used_at
	await db
		.update(table.apiKey)
		.set({ lastUsedAt: new Date() })
		.where(eq(table.apiKey.id, apiKeyRecord.id));

	// Log the config fetch
	await db.insert(table.creditTransaction).values({
		id: nanoid(),
		userId: user.id,
		action: 'agent_config_fetch',
		creditsDelta: 0,
		metadata: { keyPrefix: apiKeyRecord.keyPrefix },
	});

	return json({
		anthropic_api_key: env.ANTHROPIC_API_KEY,
		model: 'claude-opus-4-5',
		max_tokens: 8096,
		user_id: user.id,
		credits: user.tokens + user.bonusTokens,
	});
};
