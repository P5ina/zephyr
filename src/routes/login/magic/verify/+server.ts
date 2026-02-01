import { error, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { GUEST_CONFIG } from '$lib/guest-config';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import * as guestAuth from '$lib/server/guest-auth';
import { validateMagicLinkToken, markTokenUsed } from '$lib/server/magic-link';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const token = url.searchParams.get('token');

	if (!token) {
		error(400, 'Missing token');
	}

	const result = await validateMagicLinkToken(token);

	if (!result.valid) {
		error(400, 'Invalid or expired link. Please request a new one.');
	}

	// Mark token as used immediately to prevent reuse
	await markTokenUsed(result.id);

	// Find or create user
	let user = await db.query.user.findFirst({
		where: eq(table.user.email, result.email),
	});

	if (!user) {
		const [newUser] = await db
			.insert(table.user)
			.values({
				id: nanoid(),
				email: result.email,
			})
			.returning();
		user = newUser;
	}

	const sessionToken = auth.generateSessionToken();
	await auth.createSession(sessionToken, user.id);
	auth.setSessionTokenCookie(
		{ cookies } as Parameters<typeof auth.setSessionTokenCookie>[0],
		sessionToken,
		new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
	);

	// Convert guest generations to user if guest session exists
	const guestSessionId = cookies.get(GUEST_CONFIG.cookieName);
	if (guestSessionId) {
		try {
			const transferred = await guestAuth.convertGuestToUser(guestSessionId, user.id);
			if (transferred > 0) {
				console.log(`Transferred ${transferred} guest generations to user ${user.id}`);
			}
		} catch (e) {
			console.error('Failed to convert guest generations:', e);
		}
		cookies.delete(GUEST_CONFIG.cookieName, { path: '/' });
	}

	redirect(302, '/app');
};
