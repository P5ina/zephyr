export const GUEST_CONFIG = {
	maxGenerations: 3,
	maxRotationGenerations: 1,
	sessionDurationDays: 7,
	allowedAssetTypes: ['sprite'] as const,
	cookieName: 'guest-session',
} as const;

export type GuestAllowedAssetType = (typeof GUEST_CONFIG.allowedAssetTypes)[number];
