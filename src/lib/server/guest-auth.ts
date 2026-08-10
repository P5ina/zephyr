import { encodeBase64url } from '@oslojs/encoding';
import type { RequestEvent } from '@sveltejs/kit';
import { and, eq, gt, isNull, sql } from 'drizzle-orm';
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
	const expiresAt = new Date(
		Date.now() + DAY_IN_MS * GUEST_CONFIG.sessionDurationDays,
	);

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

export function getGuestRemainingGenerations(
	session: table.GuestSession,
): number {
	return Math.max(0, GUEST_CONFIG.maxGenerations - session.generationsUsed);
}

export function canGuestGenerate(session: table.GuestSession): boolean {
	return session.generationsUsed < GUEST_CONFIG.maxGenerations;
}

/**
 * Whether this address may start another free generation.
 *
 * The per-session counter alone enforces nothing: a caller that sends no
 * cookie gets a brand-new session with generationsUsed = 0, and 0 < the cap is
 * always true, so the quota only ever binds on callers who volunteer their
 * cookie. Summing what the address has already spent is what makes the cap
 * real — the ip_address column has been written on every session since the
 * beginning and read by nothing.
 *
 * Expired sessions are excluded so the cap refills on the same schedule a
 * cookie-carrying guest already gets, rather than banning an address forever.
 * Addresses are shared behind NAT and trivially changed, so this raises the
 * cost of abuse rather than preventing it; a rate limit at the edge is the
 * durable answer.
 */
export async function canGuestGenerateFromIp(
	ipAddress: string,
): Promise<boolean> {
	const [row] = await db
		.select({
			used: sql<number>`coalesce(sum(${table.guestSession.generationsUsed}), 0)`,
		})
		.from(table.guestSession)
		.where(
			and(
				eq(table.guestSession.ipAddress, ipAddress),
				gt(table.guestSession.expiresAt, new Date()),
			),
		);

	return Number(row?.used ?? 0) < GUEST_CONFIG.maxGenerations;
}

export async function countGuestRotations(
	guestSessionId: string,
): Promise<number> {
	const rotations8dir = await db.query.rotationJob.findMany({
		where: eq(table.rotationJob.guestSessionId, guestSessionId),
		columns: { id: true },
	});
	const rotations4dir = await db.query.rotationJobNew.findMany({
		where: eq(table.rotationJobNew.guestSessionId, guestSessionId),
		columns: { id: true },
	});
	return rotations8dir.length + rotations4dir.length;
}

export async function canGuestRotate(guestSessionId: string): Promise<boolean> {
	const count = await countGuestRotations(guestSessionId);
	return count < GUEST_CONFIG.maxRotationGenerations;
}

export async function getGuestRotationsRemaining(
	guestSessionId: string,
): Promise<number> {
	const count = await countGuestRotations(guestSessionId);
	return Math.max(0, GUEST_CONFIG.maxRotationGenerations - count);
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

	// Transfer all guest rotation jobs to the user
	await db
		.update(table.rotationJob)
		.set({ userId })
		.where(
			and(
				eq(table.rotationJob.guestSessionId, guestSessionId),
				isNull(table.rotationJob.userId),
			),
		);

	// Transfer all guest rotation-new jobs to the user
	await db
		.update(table.rotationJobNew)
		.set({ userId })
		.where(
			and(
				eq(table.rotationJobNew.guestSessionId, guestSessionId),
				isNull(table.rotationJobNew.userId),
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

export function getGuestSessionInfo(
	session: table.GuestSession,
): GuestSessionInfo {
	return {
		id: session.id,
		generationsUsed: session.generationsUsed,
		generationsRemaining: getGuestRemainingGenerations(session),
		expiresAt: session.expiresAt,
	};
}
