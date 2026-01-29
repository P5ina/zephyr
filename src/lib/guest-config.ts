export const GUEST_CONFIG = {
	maxGenerations: 3,
	sessionDurationDays: 7,
	allowedAssetTypes: ['sprite'] as const,
	cookieName: 'guest-session',
} as const;

export type GuestAllowedAssetType = (typeof GUEST_CONFIG.allowedAssetTypes)[number];
