import { GitHub } from 'arctic';
import { env } from '$env/dynamic/private';

const baseUrl = (env.ORIGIN || 'http://localhost:5173').trim();

export const github = new GitHub(
	(env.GITHUB_CLIENT_ID || '').trim(),
	(env.GITHUB_CLIENT_SECRET || '').trim(),
	`${baseUrl}/login/github/callback`,
);
