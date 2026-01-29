import type { Handle } from '@sveltejs/kit';
import { GUEST_CONFIG } from '$lib/guest-config';
import * as auth from '$lib/server/auth';
import * as guestAuth from '$lib/server/guest-auth';

const handleAuth: Handle = async ({ event, resolve }) => {
	const sessionToken = event.cookies.get(auth.sessionCookieName);

	if (sessionToken) {
		const { session, user } = await auth.validateSessionToken(sessionToken);

		if (session) {
			auth.setSessionTokenCookie(event, sessionToken, session.expiresAt);
		} else {
			auth.deleteSessionTokenCookie(event);
		}

		event.locals.user = user;
		event.locals.session = session;
		event.locals.guestSession = null;

		return resolve(event);
	}

	// No user session - check for guest session
	event.locals.user = null;
	event.locals.session = null;

	const guestSessionId = event.cookies.get(GUEST_CONFIG.cookieName);
	if (guestSessionId) {
		const guestSession = await guestAuth.validateGuestSession(guestSessionId);
		if (guestSession) {
			// Refresh the cookie expiry
			guestAuth.setGuestSessionCookie(event, guestSessionId, guestSession.expiresAt);
			event.locals.guestSession = guestSession;
		} else {
			// Invalid or expired guest session
			guestAuth.deleteGuestSessionCookie(event);
			event.locals.guestSession = null;
		}
	} else {
		event.locals.guestSession = null;
	}

	return resolve(event);
};

export const handle: Handle = handleAuth;
