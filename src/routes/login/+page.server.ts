import { redirect } from '@sveltejs/kit';
import { dev } from '$app/environment';
import { env } from '$env/dynamic/private';
import { validatePromoCode, PROMO_COOKIE_NAME } from '$lib/promo-codes';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, url, cookies }) => {
	if (locals.user) {
		redirect(302, '/');
	}

	const isPreview = env.VERCEL_ENV === 'preview' && !!env.PREVIEW_ACCESS_TOKEN;
	const isDev = dev;

	// Check for promo code in URL
	const promoParam = url.searchParams.get('promo');
	let promoCode: string | null = null;
	let promoBonusTokens: number | null = null;
	let promoError: string | null = null;

	if (promoParam) {
		const promo = validatePromoCode(promoParam);
		if (promo) {
			promoCode = promo.code;
			promoBonusTokens = promo.bonusTokens;
			// Store in cookie for use after OAuth callback
			cookies.set(PROMO_COOKIE_NAME, promo.code, {
				path: '/',
				maxAge: 60 * 60, // 1 hour
				httpOnly: true,
				secure: !dev,
				sameSite: 'lax',
			});
		} else {
			promoError = 'Invalid or expired promo code';
		}
	}

	return { user: null, isPreview, isDev, promoCode, promoBonusTokens, promoError };
};
