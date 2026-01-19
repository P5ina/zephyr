import { GitHub } from 'arctic';
import { env } from '$env/dynamic/private';

const baseUrl = env.ORIGIN || 'http://localhost:5173';

export const github = new GitHub(
	env.GITHUB_CLIENT_ID || '',
	env.GITHUB_CLIENT_SECRET || '',
	`${baseUrl}/login/github/callback`
);
