import { error, redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import * as auth from '$lib/server/auth';
import { getOrCreatePreviewUser } from '$lib/server/preview-auth';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ cookies }) => {
	// Only allow in preview environment
	if (env.VERCEL_ENV !== 'preview' || !env.PREVIEW_ACCESS_TOKEN) {
		error(404, 'Not found');
	}

	// Set preview token cookie
	cookies.set('preview_token', env.PREVIEW_ACCESS_TOKEN, {
		path: '/',
		maxAge: 60 * 60 * 24 * 30,
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
	});

	// Create session
	const { sessionToken, session } = await getOrCreatePreviewUser();

	cookies.set(auth.sessionCookieName, sessionToken, {
		path: '/',
		expires: session.expiresAt,
	});

	redirect(302, '/app');
};
