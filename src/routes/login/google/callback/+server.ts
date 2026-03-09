import { error, redirect } from '@sveltejs/kit';
import { track } from '@vercel/analytics/server';
import { decodeIdToken } from 'arctic';
import { eq, sql } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PROMO_COOKIE_NAME, validatePromoCode } from '$lib/promo-codes';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import * as guestAuth from '$lib/server/guest-auth';
import { google } from '$lib/server/oauth';
import type { RequestHandler } from './$types';

interface GoogleIdTokenClaims {
	sub: string;
	email: string;
	email_verified: boolean;
	name?: string;
	picture?: string;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('google_oauth_state');
	const storedCodeVerifier = cookies.get('google_oauth_code_verifier');

	if (!code || !state || state !== storedState || !storedCodeVerifier) {
		error(400, 'Invalid OAuth state');
	}

	const tokens = await google.validateAuthorizationCode(
		code,
		storedCodeVerifier,
	);
	const idToken = tokens.idToken();
	const claims = decodeIdToken(idToken) as GoogleIdTokenClaims;

	if (!claims.email || !claims.email_verified) {
		error(400, 'Could not get verified email from Google');
	}

	const googleId = claims.sub;
	const email = claims.email;

	let user = await db.query.user.findFirst({
		where: eq(table.user.googleId, googleId),
	});

	let isNewUser = false;

	if (!user) {
		user = await db.query.user.findFirst({
			where: eq(table.user.email, email),
		});

		if (user) {
			await db
				.update(table.user)
				.set({
					googleId,
					avatarUrl: user.avatarUrl || claims.picture,
					username: user.username || claims.name,
				})
				.where(eq(table.user.id, user.id));
		} else {
			isNewUser = true;
			const [newUser] = await db
				.insert(table.user)
				.values({
					id: nanoid(),
					email,
					username: claims.name,
					avatarUrl: claims.picture,
					googleId,
				})
				.returning();
			user = newUser;

			// Track signup
			await track('signup', { method: 'google' });
		}
	}

	// Apply promo code bonus for new users
	const promoCodeCookie = cookies.get(PROMO_COOKIE_NAME);
	if (isNewUser && promoCodeCookie) {
		const promo = validatePromoCode(promoCodeCookie);
		if (promo) {
			await db
				.update(table.user)
				.set({
					bonusTokens: sql`${table.user.bonusTokens} + ${promo.bonusTokens}`,
				})
				.where(eq(table.user.id, user.id));
			console.log(
				`Applied promo code ${promo.code} (+${promo.bonusTokens} tokens) to user ${user.id}`,
			);
		}
		cookies.delete(PROMO_COOKIE_NAME, { path: '/' });
	}

	const sessionToken = auth.generateSessionToken();
	await auth.createSession(sessionToken, user.id);
	auth.setSessionTokenCookie(
		{ cookies } as Parameters<typeof auth.setSessionTokenCookie>[0],
		sessionToken,
		new Date(Date.now() + 1000 * 60 * 60 * 24 * 30),
	);

	cookies.delete('google_oauth_state', { path: '/' });
	cookies.delete('google_oauth_code_verifier', { path: '/' });

	// Convert guest generations to user if guest session exists
	const guestSessionId = cookies.get(GUEST_CONFIG.cookieName);
	if (guestSessionId) {
		try {
			const transferred = await guestAuth.convertGuestToUser(
				guestSessionId,
				user.id,
			);
			if (transferred > 0) {
				console.log(
					`Transferred ${transferred} guest generations to user ${user.id}`,
				);
			}
		} catch (e) {
			console.error('Failed to convert guest generations:', e);
		}
		cookies.delete(GUEST_CONFIG.cookieName, { path: '/' });
	}

	redirect(302, '/app');
};
