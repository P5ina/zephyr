import { error, redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { github } from '$lib/server/oauth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { eq } from 'drizzle-orm';
import * as auth from '$lib/server/auth';
import { nanoid } from 'nanoid';

interface GitHubUser {
	id: number;
	login: string;
	email: string | null;
	avatar_url: string;
}

interface GitHubEmail {
	email: string;
	primary: boolean;
	verified: boolean;
}

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const storedState = cookies.get('github_oauth_state');

	if (!code || !state || state !== storedState) {
		error(400, 'Invalid OAuth state');
	}

	const tokens = await github.validateAuthorizationCode(code);
	const accessToken = tokens.accessToken();

	const userResponse = await fetch('https://api.github.com/user', {
		headers: { Authorization: `Bearer ${accessToken}` },
	});
	const githubUser: GitHubUser = await userResponse.json();

	let email = githubUser.email;
	if (!email) {
		const emailsResponse = await fetch('https://api.github.com/user/emails', {
			headers: { Authorization: `Bearer ${accessToken}` },
		});
		const emails: GitHubEmail[] = await emailsResponse.json();
		const primaryEmail = emails.find((e) => e.primary && e.verified);
		email = primaryEmail?.email ?? emails[0]?.email;
	}

	if (!email) {
		error(400, 'Could not get email from GitHub');
	}

	let user = await db.query.user.findFirst({
		where: eq(table.user.githubId, githubUser.id),
	});

	if (!user) {
		user = await db.query.user.findFirst({
			where: eq(table.user.email, email),
		});

		if (user) {
			await db
				.update(table.user)
				.set({
					githubId: githubUser.id,
					avatarUrl: user.avatarUrl || githubUser.avatar_url,
					username: user.username || githubUser.login,
				})
				.where(eq(table.user.id, user.id));
		} else {
			const [newUser] = await db
				.insert(table.user)
				.values({
					id: nanoid(),
					email,
					username: githubUser.login,
					avatarUrl: githubUser.avatar_url,
					githubId: githubUser.id,
				})
				.returning();
			user = newUser;
		}
	}

	const sessionToken = auth.generateSessionToken();
	await auth.createSession(sessionToken, user.id);
	auth.setSessionTokenCookie(
		{ cookies } as Parameters<typeof auth.setSessionTokenCookie>[0],
		sessionToken,
		new Date(Date.now() + 1000 * 60 * 60 * 24 * 30)
	);

	cookies.delete('github_oauth_state', { path: '/' });

	redirect(302, '/');
};
