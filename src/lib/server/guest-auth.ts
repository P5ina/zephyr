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
 * How much one address may spend in a day, as a multiple of the per-visitor
 * cap. This is a backstop against scripted abuse, NOT a per-person quota:
 * addresses are shared by everyone behind an office router, a campus, a hotel,
 * or a mobile carrier's CGNAT, so a limit set at the per-visitor cap would
 * refuse the third colleague's very first click. Set generously — turning
 * "unlimited free GPU jobs from one machine" into "a few dozen" is the win;
 * squeezing it further only hurts real visitors. A rate limit at the edge,
 * keyed on more than an address, is the durable answer.
 */
const ADDRESS_BURST_MULTIPLIER = 5;
const ADDRESS_WINDOW_HOURS = 24;

/**
 * Creates a guest session for `ipAddress`, unless that address has already
 * spent its daily allowance. Returns null when the allowance is exhausted.
 *
 * Why the check and the insert are one statement: the per-session counter
 * enforces nothing on its own, because a caller that sends no cookie gets a
 * fresh session with generationsUsed = 0 and 0 < cap is always true. Summing
 * what the address already spent fixes that — but only if the sum and the
 * insert cannot be separated. Checking first and inserting afterwards leaves a
 * window in which N simultaneous cookie-less requests all read zero and all
 * mint a session, which is the same read-check-write defect this codebase is
 * being cleared of. Here the sum is a subquery in the INSERT's WHERE, so the
 * row is created only if the address was still under its allowance at the
 * moment of the write.
 *
 * Sessions already converted to accounts are excluded — a neighbour who signed
 * up should stop consuming the address's allowance — and the window is a day
 * rather than the session's seven-day lifetime, so the allowance refills.
 */
export async function createGuestSessionForAddress(params: {
	ipAddress: string;
	/** The per-visitor cap this endpoint enforces; the address allowance is a multiple of it. */
	cap: number;
}): Promise<table.GuestSession | null> {
	const { ipAddress, cap } = params;
	const id = generateGuestSessionId();
	const expiresAt = new Date(
		Date.now() + DAY_IN_MS * GUEST_CONFIG.sessionDurationDays,
	);
	const allowance = cap * ADDRESS_BURST_MULTIPLIER;

	const result = await db.execute(sql`
		INSERT INTO guest_session (id, ip_address, generations_used, expires_at)
		SELECT ${id}, ${ipAddress}, 0, ${expiresAt.toISOString()}::timestamptz
		 WHERE (
		     SELECT coalesce(sum(generations_used), 0)
		       FROM guest_session
		      WHERE ip_address = ${ipAddress}
		        AND converted_to_user_id IS NULL
		        AND created_at > now() - ${`${ADDRESS_WINDOW_HOURS} hours`}::interval
		   ) < ${allowance}
		RETURNING id, ip_address, generations_used, created_at, expires_at,
		          converted_to_user_id
	`);

	const row = result.rows[0] as
		| {
				id: string;
				ip_address: string;
				generations_used: number;
				created_at: Date | string;
				expires_at: Date | string;
				converted_to_user_id: string | null;
		  }
		| undefined;
	if (!row) return null;

	return {
		id: row.id,
		ipAddress: row.ip_address,
		generationsUsed: Number(row.generations_used),
		createdAt: new Date(row.created_at),
		expiresAt: new Date(row.expires_at),
		convertedToUserId: row.converted_to_user_id,
	};
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
