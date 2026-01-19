import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { github } from '$lib/server/oauth';
import { generateState } from 'arctic';

export const GET: RequestHandler = async ({ cookies }) => {
	const state = generateState();
	const url = github.createAuthorizationURL(state, ['user:email']);

	cookies.set('github_oauth_state', state, {
		path: '/',
		httpOnly: true,
		maxAge: 60 * 10,
		sameSite: 'lax',
	});

	redirect(302, url.toString());
};
