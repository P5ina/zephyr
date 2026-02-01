import { GitHub, Google } from 'arctic';
import { env } from '$env/dynamic/private';

const baseUrl = (env.ORIGIN || 'http://localhost:5173').trim();

export const github = new GitHub(
	(env.GITHUB_CLIENT_ID || '').trim(),
	(env.GITHUB_CLIENT_SECRET || '').trim(),
	`${baseUrl}/login/github/callback`,
);

export const google = new Google(
	(env.GOOGLE_CLIENT_ID || '').trim(),
	(env.GOOGLE_CLIENT_SECRET || '').trim(),
	`${baseUrl}/login/google/callback`,
);
