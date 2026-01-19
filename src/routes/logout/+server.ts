import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import * as auth from '$lib/server/auth';

export const GET: RequestHandler = async ({ locals, cookies }) => {
	if (locals.session) {
		await auth.invalidateSession(locals.session.id);
	}
	auth.deleteSessionTokenCookie({ cookies } as Parameters<typeof auth.deleteSessionTokenCookie>[0]);
	redirect(302, '/login');
};
