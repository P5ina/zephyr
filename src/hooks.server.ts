import type { Handle, HandleServerError } from '@sveltejs/kit';
import { sequence } from '@sveltejs/kit/hooks';
import { GUEST_CONFIG } from '$lib/guest-config';
import * as auth from '$lib/server/auth';
import * as guestAuth from '$lib/server/guest-auth';
import { getPostHogClient } from '$lib/server/posthog';

const handleIngest: Handle = async ({ event, resolve }) => {
	const { pathname } = event.url;

	if (pathname.startsWith('/ingest')) {
		const useAssetHost =
			pathname.startsWith('/ingest/static/') ||
			pathname.startsWith('/ingest/array/');
		const hostname = useAssetHost
			? 'us-assets.i.posthog.com'
			: 'us.i.posthog.com';

		const url = new URL(event.request.url);
		url.protocol = 'https:';
		url.hostname = hostname;
		url.port = '443';
		url.pathname = pathname.replace(/^\/ingest/, '');

		const headers = new Headers(event.request.headers);
		headers.set('host', hostname);
		headers.set('accept-encoding', '');

		const clientIp =
			event.request.headers.get('x-forwarded-for') || event.getClientAddress();
		if (clientIp) {
			headers.set('x-forwarded-for', clientIp);
		}

		return fetch(url.toString(), {
			method: event.request.method,
			headers,
			body: event.request.body,
			// @ts-expect-error - duplex is required for streaming request bodies
			duplex: 'half',
		});
	}

	return resolve(event);
};

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
			guestAuth.setGuestSessionCookie(
				event,
				guestSessionId,
				guestSession.expiresAt,
			);
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

export const handle: Handle = sequence(handleIngest, handleAuth);

export const handleError: HandleServerError = async ({
	error,
	status,
	message,
}) => {
	const posthog = getPostHogClient();

	posthog.capture({
		distinctId: 'server',
		event: 'server_error',
		properties: {
			error: error instanceof Error ? error.message : String(error),
			status,
			message,
		},
	});

	return {
		message,
		status,
	};
};
