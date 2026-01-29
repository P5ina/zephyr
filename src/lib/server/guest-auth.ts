import { encodeBase64url } from '@oslojs/encoding';
import type { RequestEvent } from '@sveltejs/kit';
import { eq, and, gt, isNull, sql } from 'drizzle-orm';
import { GUEST_CONFIG } from '$lib/guest-config';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

const DAY_IN_MS = 1000 * 60 * 60 * 24;

export function generateGuestSessionId(): string {
	const bytes = crypto.getRandomValues(new Uint8Array(18));
	return encodeBase64url(bytes);
}

export async function createGuestSession(
	ipAddress: string,
): Promise<table.GuestSession> {
	const id = generateGuestSessionId();
	const expiresAt = new Date(Date.now() + DAY_IN_MS * GUEST_CONFIG.sessionDurationDays);

	const [session] = await db
		.insert(table.guestSession)
		.values({
			id,
			ipAddress,
			generationsUsed: 0,
			expiresAt,
		})
		.returning();

	return session;
}

export async function validateGuestSession(
	sessionId: string,
): Promise<table.GuestSession | null> {
	const session = await db.query.guestSession.findFirst({
		where: and(
			eq(table.guestSession.id, sessionId),
			gt(table.guestSession.expiresAt, new Date()),
			isNull(table.guestSession.convertedToUserId),
		),
	});

	return session ?? null;
}

export async function incrementGuestUsage(sessionId: string): Promise<void> {
	await db
		.update(table.guestSession)
		.set({
			generationsUsed: sql`${table.guestSession.generationsUsed} + 1`,
		})
		.where(eq(table.guestSession.id, sessionId));
}

export function getGuestRemainingGenerations(session: table.GuestSession): number {
	return Math.max(0, GUEST_CONFIG.maxGenerations - session.generationsUsed);
}

export function canGuestGenerate(session: table.GuestSession): boolean {
	return session.generationsUsed < GUEST_CONFIG.maxGenerations;
}

export function setGuestSessionCookie(
	event: RequestEvent,
	sessionId: string,
	expiresAt: Date,
): void {
	event.cookies.set(GUEST_CONFIG.cookieName, sessionId, {
		expires: expiresAt,
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
	});
}

export function deleteGuestSessionCookie(event: RequestEvent): void {
	event.cookies.delete(GUEST_CONFIG.cookieName, {
		path: '/',
	});
}

export async function convertGuestToUser(
	guestSessionId: string,
	userId: string,
): Promise<number> {
	// Transfer all guest generations to the user
	const result = await db
		.update(table.assetGeneration)
		.set({ userId })
		.where(
			and(
				eq(table.assetGeneration.guestSessionId, guestSessionId),
				isNull(table.assetGeneration.userId),
			),
		);

	// Mark the guest session as converted
	await db
		.update(table.guestSession)
		.set({ convertedToUserId: userId })
		.where(eq(table.guestSession.id, guestSessionId));

	return result.rowCount ?? 0;
}

export type GuestSessionInfo = {
	id: string;
	generationsUsed: number;
	generationsRemaining: number;
	expiresAt: Date;
};

export function getGuestSessionInfo(session: table.GuestSession): GuestSessionInfo {
	return {
		id: session.id,
		generationsUsed: session.generationsUsed,
		generationsRemaining: getGuestRemainingGenerations(session),
		expiresAt: session.expiresAt,
	};
}
