import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/');
	}

	const isPreview = env.VERCEL_ENV === 'preview' && !!env.PREVIEW_ACCESS_TOKEN;

	return { user: null, isPreview };
};
