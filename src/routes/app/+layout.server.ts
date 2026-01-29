import { GUEST_CONFIG } from '$lib/guest-config';
import { getGuestSessionInfo } from '$lib/server/guest-auth';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	if (locals.user) {
		return {
			user: locals.user,
			isGuest: false as const,
			guestSession: null,
		};
	}

	// Allow guests to access /app
	if (locals.guestSession) {
		return {
			user: null,
			isGuest: true as const,
			guestSession: getGuestSessionInfo(locals.guestSession),
		};
	}

	// No user, no guest session yet - will be created on first generation
	return {
		user: null,
		isGuest: true as const,
		guestSession: {
			id: null,
			generationsUsed: 0,
			generationsRemaining: GUEST_CONFIG.maxGenerations,
			expiresAt: null,
		},
	};
};
