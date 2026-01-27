import { error, redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import * as auth from '$lib/server/auth';
import { getOrCreateDevUser } from '$lib/server/dev-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	// Only allow in development
	if (!dev) {
		error(404, 'Not found');
	}

	// Create session
	const { sessionToken, session } = await getOrCreateDevUser();

	cookies.set(auth.sessionCookieName, sessionToken, {
		path: '/',
		expires: session.expiresAt,
	});

	redirect(302, '/app');
};
