import { encodeHexLowerCase } from '@oslojs/encoding';
import { eq, and, gt, isNull } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { env } from '$env/dynamic/private';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

const TOKEN_EXPIRY_MINUTES = 15;

export function generateMagicLinkToken(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(32));
	return encodeHexLowerCase(bytes);
}

export async function createMagicLink(email: string): Promise<string> {
	const token = generateMagicLinkToken();
	const expiresAt = new Date(Date.now() + TOKEN_EXPIRY_MINUTES * 60 * 1000);

	await db.insert(table.magicLinkToken).values({
		id: nanoid(),
		email: email.toLowerCase(),
		token,
		expiresAt,
	});

	const baseUrl = (env.ORIGIN || 'http://localhost:5173').trim();
	return `${baseUrl}/login/magic/verify?token=${token}`;
}

export async function validateMagicLinkToken(
	token: string,
): Promise<{ valid: true; id: string; email: string } | { valid: false }> {
	const result = await db.query.magicLinkToken.findFirst({
		where: and(
			eq(table.magicLinkToken.token, token),
			gt(table.magicLinkToken.expiresAt, new Date()),
			isNull(table.magicLinkToken.usedAt),
		),
	});

	if (!result) {
		return { valid: false };
	}

	return { valid: true, id: result.id, email: result.email };
}

export async function markTokenUsed(id: string): Promise<void> {
	await db
		.update(table.magicLinkToken)
		.set({ usedAt: new Date() })
		.where(eq(table.magicLinkToken.id, id));
}
