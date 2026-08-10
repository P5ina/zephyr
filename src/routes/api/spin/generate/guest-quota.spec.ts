/**
 * Guest quota invariants for POST /api/spin/generate.
 *
 * Two rules, and they are not the same rule.
 *
 * A VISITOR gets GUEST_CONFIG.maxGenerations free spins. That is enforced
 * against a `guest-session` cookie the caller volunteers, so it binds only on
 * callers who volunteer it: withhold the cookie and the handler would mint a
 * brand new session with `generationsUsed = 0`, and `0 < 3` is always true.
 *
 * An ADDRESS therefore gets its own, looser bound — ADDRESS_BURST_MULTIPLIER
 * visitors' worth of spins inside a 24-hour window — checked before the
 * session is minted, against the recorded `ip_address` the client cannot
 * discard. It is deliberately not the per-visitor cap: an address is not a
 * person. An office router, a campus, or a carrier's CGNAT puts many
 * first-time visitors behind one address, and capping the address at one
 * visitor's worth turned the third colleague's very first click into a 429.
 *
 * So the tests below pin both halves. A cookie-less caller must still be
 * bounded — that is the invariant, and it must fail if the bound is removed —
 * but bounded at the address allowance, not at one visitor's cap.
 */
import {
	afterAll,
	beforeAll,
	beforeEach,
	describe,
	expect,
	it,
	vi,
} from 'vitest';
import { eq } from 'drizzle-orm';
import { GUEST_CONFIG } from '$lib/guest-config';
import * as table from '$lib/server/db/schema';
import {
	createTestDatabase,
	type TestDatabase,
} from '$lib/server/db/test-harness';

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('$lib/server/db', () => ({
	db: new Proxy(
		{},
		{
			get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop],
		},
	),
}));

vi.mock('$env/dynamic/private', () => ({
	env: {
		BLOB_READ_WRITE_TOKEN: 'test-blob-token',
		FAL_KEY: 'test-fal-key',
	},
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async (pathname: string) => ({
		url: `https://blob.test/${pathname}`,
		pathname,
	})),
}));

vi.mock('$lib/server/fal', () => ({
	submitSpinJob: vi.fn(async () => ({ requestId: 'fal-req-test' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

const { POST } = await import('./+server');

/** 1x1 PNG — real bytes, so the handler's sharp pipeline runs for real. */
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const GUEST_IP = '203.0.113.7';
const SESSION_ID = 'guest-session-1';
const USER_ID = 'user-1';

/**
 * Mirrors ADDRESS_BURST_MULTIPLIER in $lib/server/guest-auth, which is module
 * private, so this copy has to be kept in step with it by hand. An address may
 * spend this multiple of the per-visitor cap inside the 24-hour window before
 * cookie-less callers from it are refused.
 */
const ADDRESS_BURST_MULTIPLIER = 5;
/** What one address may spend on this endpoint in a day. */
const ADDRESS_ALLOWANCE =
	GUEST_CONFIG.maxGenerations * ADDRESS_BURST_MULTIPLIER;
/** Comfortably more cookie-less arrivals than the allowance can pay for. */
const CONCURRENT_GUESTS = ADDRESS_ALLOWANCE + 7;

type GuestEvent = {
	request: Request;
	locals: { user: null; guestSession: table.GuestSession | null };
	getClientAddress: () => string;
};

function imageRequest(): Request {
	const form = new FormData();
	form.append(
		'image',
		new File([new Uint8Array(PNG_1X1)], 'input.png', { type: 'image/png' }),
	);
	return new Request('http://localhost/api/spin/generate', {
		method: 'POST',
		body: form,
	});
}

function generate(options: {
	guestSession?: table.GuestSession | null;
	ip?: string;
}): Promise<Response> {
	return (POST as unknown as (event: GuestEvent) => Promise<Response>)({
		request: imageRequest(),
		locals: { user: null, guestSession: options.guestSession ?? null },
		getClientAddress: () => options.ip ?? GUEST_IP,
	});
}

describe('POST /api/spin/generate — guest quota', () => {
	let ctx: TestDatabase;

	/** Mirrors hooks.server.ts: the cookie is re-read from the DB each request. */
	async function loadSession(id: string): Promise<table.GuestSession> {
		const [row] = await ctx.db
			.select()
			.from(table.guestSession)
			.where(eq(table.guestSession.id, id));
		return row;
	}

	async function seedSession(
		id: string,
		generationsUsed: number,
		ipAddress = GUEST_IP,
	): Promise<table.GuestSession> {
		const [row] = await ctx.db
			.insert(table.guestSession)
			.values({
				id,
				ipAddress,
				generationsUsed,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			})
			.returning();
		return row;
	}

	async function jobCount(): Promise<number> {
		const rows = await ctx.db
			.select({ id: table.spinJob.id })
			.from(table.spinJob);
		return rows.length;
	}

	/** N cookie-less arrivals at once; how many were served a spin. */
	async function burst(size: number, ip = GUEST_IP): Promise<number> {
		const results = await Promise.allSettled(
			Array.from({ length: size }, () => generate({ ip })),
		);
		return results.filter(
			(r) => r.status === 'fulfilled' && r.value.status === 200,
		).length;
	}

	beforeAll(async () => {
		ctx = await createTestDatabase();
		holder.db = ctx.db;
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	beforeEach(async () => {
		await ctx.reset();
	});

	// Baseline: the cookie-carrying path does honour the per-visitor cap. This
	// one is what makes the rest meaningful — the rule exists, it is just
	// trivially opted out of when the cookie is withheld.
	it('cuts a cookie-carrying guest off after GUEST_CONFIG.maxGenerations', async () => {
		await seedSession(SESSION_ID, 0);

		for (let i = 0; i < GUEST_CONFIG.maxGenerations; i++) {
			const response = await generate({
				guestSession: await loadSession(SESSION_ID),
			});
			expect(response.status).toBe(200);
		}

		await expect(
			generate({ guestSession: await loadSession(SESSION_ID) }),
		).rejects.toMatchObject({ status: 429 });

		expect(await jobCount()).toBe(GUEST_CONFIG.maxGenerations);
	});

	// The rule the address allowance exists for, and the half a per-visitor cap
	// on the address got wrong: one address is not one visitor. A colleague who
	// has already spent a whole visitor's cap from the office router must not
	// make the next person's very first click a 429.
	it('serves a fresh cookie-less visitor from an address one visitor has already used', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

		const response = await generate({ guestSession: null, ip: GUEST_IP });

		expect(response.status).toBe(200);
		expect(await jobCount()).toBe(1);
	});

	// ...and the half it got right. The address is bounded: once the day's
	// allowance is spent, the caller that drops its cookie is refused, because
	// the fresh session it would have been handed is never minted.
	it('refuses a cookie-less caller once the address has spent its allowance', async () => {
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);

		await expect(
			generate({ guestSession: null, ip: GUEST_IP }),
		).rejects.toMatchObject({ status: 429 });

		expect(await jobCount()).toBe(0);
	});

	// The invariant that matters. A caller that never sends the cookie is the
	// one caller the per-session counter cannot see, so it must be bounded by
	// the address instead. Arriving one after another, the bound is exact:
	// every served spin spends one unit of the allowance.
	it('caps a cookie-less caller at exactly the address allowance', async () => {
		const attempts = ADDRESS_ALLOWANCE + 2;

		let accepted = 0;
		for (let i = 0; i < attempts; i++) {
			try {
				const response = await generate({ guestSession: null });
				if (response.status === 200) accepted++;
			} catch {
				// 429 once the allowance is spent — that is the point of the test.
			}
		}

		expect(accepted).toBe(ADDRESS_ALLOWANCE);
		expect(await jobCount()).toBe(ADDRESS_ALLOWANCE);
	});

	// Concurrency. CONCURRENT_GUESTS requests arrive together, none of them
	// carrying a session, at an address whose allowance is already gone. None
	// may be served, however they interleave: the refusal comes from the mint's
	// own WHERE, so no ordering of the burst can produce a session for any of
	// them to spend.
	it('serves none of a simultaneous cookie-less burst once the address is spent', async () => {
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);

		const accepted = await burst(CONCURRENT_GUESTS);

		expect(accepted).toBe(0);
		expect(await jobCount()).toBe(0);
	});

	// The same burst against an address that has NOT yet spent its allowance.
	// Here it is served exactly ADDRESS_ALLOWANCE times, but read the reason
	// before trusting it: on this endpoint the multipart parse and the sharp
	// pipeline both run before the mint, and sharp's completion callback is a
	// real event-loop turn, so the arrivals reach the mint one at a time and
	// each one's increment is committed before the next one is checked. Nothing
	// in the mint is holding this line.
	//
	// The endpoints whose first await IS the mint — assets, rotate, rotate-new —
	// do not survive the identical burst, and their specs carry the failing case
	// as `it.fails` with the analysis. In production this endpoint is no safer
	// than those: several serverless instances mint against one database, and
	// nothing serialises them the way one Node process does.
	it('bounds a simultaneous cookie-less burst at the address allowance', async () => {
		const accepted = await burst(CONCURRENT_GUESTS);

		expect(accepted).toBeLessThanOrEqual(ADDRESS_ALLOWANCE);
		expect(await jobCount()).toBeLessThanOrEqual(ADDRESS_ALLOWANCE);
	});

	// A different address is a different set of visitors: the backstop must not
	// spill one address's exhaustion onto everyone else.
	it('lets a different address spin after another is exhausted', async () => {
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);

		const response = await generate({
			guestSession: null,
			ip: '198.51.100.4',
		});

		expect(response.status).toBe(200);
		expect(await jobCount()).toBe(1);
	});

	// A neighbour who signed up stops consuming the address's allowance —
	// otherwise one converted visitor would keep the office locked out for the
	// rest of the day.
	it('stops counting a session once it converts to an account', async () => {
		await ctx.db.insert(table.user).values({
			id: USER_ID,
			email: 'u@example.com',
			tokens: 0,
			bonusTokens: 0,
		});
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);
		await ctx.db
			.update(table.guestSession)
			.set({ convertedToUserId: USER_ID })
			.where(eq(table.guestSession.id, SESSION_ID));

		const response = await generate({ guestSession: null, ip: GUEST_IP });

		expect(response.status).toBe(200);
		expect(await jobCount()).toBe(1);
	});
});
