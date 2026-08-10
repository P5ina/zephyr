/**
 * Invariants for token deduction and the guest quota on the rotate-new path.
 *
 * These are written against the behaviour the code MUST have, not the
 * behaviour it happened to have. Two separate holes meet on this endpoint:
 *
 *  1. Credit. `locals.user` is a snapshot the auth hook loads once per request,
 *     so N requests that arrive together all carry the balance as it stood
 *     before any of them deducted. The concurrency tests reproduce that
 *     literally — they read N snapshots from the database first, then hand each
 *     one to its own handler invocation. No interleaving luck is required: an
 *     unconditional `tokens = tokens - cost` overdraws deterministically, while
 *     a charge whose WHERE carries the balance predicate cannot.
 *
 *  2. Guest quota. The per-session counter enforces nothing on a caller that
 *     never sends the cookie, because a freshly minted session always reads
 *     generationsUsed = 0. The bound has to be consulted before the session is
 *     minted, against something the client cannot discard — the recorded ip
 *     address. But an address is not a visitor: offices, campuses and CGNAT put
 *     many first-time visitors behind one, so the address gets
 *     ADDRESS_BURST_MULTIPLIER visitors' worth of rotations per day rather than
 *     one visitor's. Both halves are pinned below — a visitor that exceeds the
 *     allowance is refused, a visitor that merely follows another one is not.
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
import { PRICING } from '$lib/pricing';
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
	submitRotationJob: vi.fn(async () => ({ requestId: 'fal-req-test' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

const { submitRotationJob } = await import('$lib/server/fal');
const { POST } = await import('./+server');

const USER_ID = 'user-1';
const TOKEN_COST = PRICING.tokenCosts.rotationNew;
const CONCURRENT_REQUESTS = 10;
const GUEST_IP = '203.0.113.7';
const SESSION_ID = 'guest-session-1';
const IMAGE_URL = 'https://blob.test/input.png';

/**
 * Mirrors ADDRESS_BURST_MULTIPLIER in $lib/server/guest-auth, which is module
 * private, so this copy has to be kept in step with it by hand. An address may
 * spend this multiple of the per-visitor cap inside the 24-hour window before
 * cookie-less callers from it are refused.
 */
const ADDRESS_BURST_MULTIPLIER = 5;
/** What one address may spend on this endpoint in a day. */
const ADDRESS_ALLOWANCE =
	GUEST_CONFIG.maxRotationGenerations * ADDRESS_BURST_MULTIPLIER;
/** Comfortably more cookie-less arrivals than the allowance can pay for. */
const CONCURRENT_GUESTS = ADDRESS_ALLOWANCE + 7;

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

type GenerateEvent = {
	request: Request;
	locals: {
		user: UserSnapshot | null;
		guestSession: table.GuestSession | null;
	};
	getClientAddress: () => string;
};

let ctx: TestDatabase;

function rotateRequest(): Request {
	return new Request('http://localhost/api/rotate-new/generate', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ imageUrl: IMAGE_URL, elevation: 0 }),
	});
}

function invoke(event: Partial<GenerateEvent>): Promise<Response> {
	return (POST as unknown as (e: GenerateEvent) => Promise<Response>)({
		request: rotateRequest(),
		locals: { user: null, guestSession: null, ...event.locals },
		getClientAddress: event.getClientAddress ?? (() => GUEST_IP),
	});
}

/** One authenticated request carrying the snapshot the auth hook loaded. */
function generateRequest(user: UserSnapshot): Promise<Response> {
	return invoke({ locals: { user, guestSession: null } });
}

/** What the auth hook puts on `locals.user`: a read, taken once per request. */
async function loadSnapshot(): Promise<UserSnapshot> {
	const [row] = await ctx.db
		.select({
			id: table.user.id,
			tokens: table.user.tokens,
			bonusTokens: table.user.bonusTokens,
		})
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row;
}

async function seedUser(tokens: number, bonusTokens = 0) {
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'u@example.com',
		tokens,
		bonusTokens,
	});
}

async function buckets() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row;
}

async function balance() {
	const row = await buckets();
	return row.tokens + row.bonus;
}

function jobs() {
	return ctx.db
		.select()
		.from(table.rotationJobNew)
		.where(eq(table.rotationJobNew.userId, USER_ID));
}

async function allJobCount(): Promise<number> {
	const rows = await ctx.db
		.select({ id: table.rotationJobNew.id })
		.from(table.rotationJobNew);
	return rows.length;
}

describe('POST /api/rotate-new/generate — credit', () => {
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

	it('rejects a user who cannot afford the cost and deducts nothing', async () => {
		await seedUser(TOKEN_COST - 1);

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 402,
		});

		expect(await balance()).toBe(TOKEN_COST - 1);
		expect(await jobs()).toHaveLength(0);
	});

	it('spends exactly one generation worth of credit on one request', async () => {
		await seedUser(TOKEN_COST);

		const response = await generateRequest(await loadSnapshot());

		expect(response.status).toBe(200);
		expect(await balance()).toBe(0);
		expect(await jobs()).toHaveLength(1);
	});

	// The money invariant. Ten requests carrying the same pre-deduction snapshot
	// must never spend credit the account does not have: the balance floor is 0,
	// never negative, no matter how the requests interleave.
	it('never lets concurrent generates overdraw the balance', async () => {
		await seedUser(TOKEN_COST);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await balance()).toBe(0);
		expect(await balance()).toBeGreaterThanOrEqual(0);
	});

	// The other half of the same invariant: credit for one generation must buy
	// one generation, not ten.
	it('grants exactly one generation for one generation worth of credit', async () => {
		await seedUser(TOKEN_COST);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await jobs()).toHaveLength(1);
	});

	// The job row is the only record of which bucket paid, so a later refund can
	// only restore the right one if the split written here came from the charge
	// rather than from the request's stale snapshot.
	it('records the bucket split the charge actually took', async () => {
		await seedUser(TOKEN_COST, 5);

		const response = await generateRequest(await loadSnapshot());
		const body = await response.json();

		const [job] = await jobs();
		expect(job.tokenCost).toBe(TOKEN_COST);
		expect(job.bonusTokenCost).toBe(5);

		// Bonus is spent first, so the remainder comes out of the purchased bucket.
		expect(await buckets()).toEqual({ tokens: TOKEN_COST - 7, bonus: 0 });

		// Reported from the row, not from snapshot arithmetic.
		expect(body.tokensRemaining).toBe(TOKEN_COST - 7);
		expect(body.bonusTokensRemaining).toBe(0);
	});

	it('returns each bucket intact when submission fails', async () => {
		await seedUser(TOKEN_COST, 5);
		vi.mocked(submitRotationJob).mockRejectedValueOnce(new Error('fal down'));
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		quiet.mockRestore();

		expect(await buckets()).toEqual({ tokens: TOKEN_COST, bonus: 5 });

		const [job] = await jobs();
		expect(job.status).toBe('failed');
	});
});

describe('POST /api/rotate-new/generate — guest quota', () => {
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

	function guestGenerate(options: {
		guestSession?: table.GuestSession | null;
		ip?: string;
	}): Promise<Response> {
		return invoke({
			locals: { user: null, guestSession: options.guestSession ?? null },
			getClientAddress: () => options.ip ?? GUEST_IP,
		});
	}

	/** N cookie-less arrivals at once; how many were served a rotation. */
	async function burst(size: number, ip = GUEST_IP): Promise<number> {
		const results = await Promise.allSettled(
			Array.from({ length: size }, () => guestGenerate({ ip })),
		);
		return results.filter(
			(r) => r.status === 'fulfilled' && r.value.status === 200,
		).length;
	}

	// Baseline: the cookie-carrying path does honour the per-visitor cap. This
	// one holds already, and it is what makes the rest meaningful — the rule
	// exists, it is just trivially opted out of.
	it('cuts a cookie-carrying guest off after the rotation cap', async () => {
		await seedSession(SESSION_ID, 0);

		for (let i = 0; i < GUEST_CONFIG.maxRotationGenerations; i++) {
			const response = await guestGenerate({
				guestSession: await loadSession(SESSION_ID),
			});
			expect(response.status).toBe(200);
		}

		await expect(
			guestGenerate({ guestSession: await loadSession(SESSION_ID) }),
		).rejects.toMatchObject({ status: 429 });

		expect(await allJobCount()).toBe(GUEST_CONFIG.maxRotationGenerations);
	});

	// The rule the address allowance exists for, and the half a per-visitor cap
	// on the address got wrong: one address is not one visitor. A colleague who
	// has already spent a whole visitor's cap from the office router must not
	// make the next person's very first click a 429.
	it('serves a fresh cookie-less visitor from an address one visitor has already used', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxRotationGenerations);

		const response = await guestGenerate({ guestSession: null, ip: GUEST_IP });

		expect(response.status).toBe(200);
		expect(await allJobCount()).toBe(1);
	});

	// ...and the half it got right. The address is bounded: once the day's
	// allowance is spent, the caller that drops its cookie is refused, because
	// the fresh session it would have been handed is never minted.
	it('refuses a cookie-less caller once the address has spent its allowance', async () => {
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);

		await expect(
			guestGenerate({ guestSession: null, ip: GUEST_IP }),
		).rejects.toMatchObject({ status: 429 });

		expect(await allJobCount()).toBe(0);
	});

	// The invariant that matters. A caller that never sends the cookie is the
	// one caller the per-session counter cannot see, so it must be bounded by
	// the address instead. Arriving one after another, the bound is exact:
	// every served rotation spends one unit of the allowance.
	it('caps a cookie-less caller at exactly the address allowance', async () => {
		const attempts = ADDRESS_ALLOWANCE + 2;

		let accepted = 0;
		for (let i = 0; i < attempts; i++) {
			try {
				const response = await guestGenerate({ guestSession: null });
				if (response.status === 200) accepted++;
			} catch {
				// 429 once the allowance is spent — that is the point of the test.
			}
		}

		expect(accepted).toBe(ADDRESS_ALLOWANCE);
		expect(await allJobCount()).toBe(ADDRESS_ALLOWANCE);
	});

	// Concurrency. CONCURRENT_GUESTS requests arrive together, none of them
	// carrying a session, at an address whose allowance is already gone. They
	// all reach the mint before any of them can finish, so nothing any of them
	// does can inform the others: the refusal has to come from the write itself.
	// Not one may be served.
	it('serves none of a simultaneous cookie-less burst once the address is spent', async () => {
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);

		const accepted = await burst(CONCURRENT_GUESTS);

		expect(accepted).toBe(0);
		expect(await allJobCount()).toBe(0);
	});

	// KNOWN GAP, kept executable rather than described in a comment nobody runs.
	//
	// The same burst against an address that has NOT yet spent its allowance is
	// not bounded at all: all CONCURRENT_GUESTS are served. The mint's WHERE
	// sums generations_used, and a session it has just created contributes 0
	// until the request that owns it finishes and increments — so every request
	// in the burst reads the same pre-burst total and every one of them passes.
	// Fusing the check into the INSERT closed the read-check-write window but
	// not this one; the fix is for the mint to charge the allowance for the
	// session it creates (count the row, e.g. sum(greatest(generations_used, 1))
	// or + count(*)), which lives in $lib/server/guest-auth.
	//
	// Left honestly red rather than marked as an expected failure: the assertion
	// is the rule we want, and the address counter cannot serialise a burst
	// without a lockable per-address row. Tracked, not hidden.
	it('bounds a simultaneous cookie-less burst at the address allowance', async () => {
		const accepted = await burst(CONCURRENT_GUESTS);

		expect(accepted).toBeLessThanOrEqual(ADDRESS_ALLOWANCE);
	});

	// A different address is a different set of visitors: the backstop must not
	// spill one address's exhaustion onto everyone else.
	it('lets a different address through when one address is exhausted', async () => {
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);

		const response = await guestGenerate({
			guestSession: null,
			ip: '198.51.100.4',
		});

		expect(response.status).toBe(200);
		expect(await allJobCount()).toBe(1);
	});

	// A neighbour who signed up stops consuming the address's allowance —
	// otherwise one converted visitor would keep the office locked out for the
	// rest of the day.
	it('stops counting a session once it converts to an account', async () => {
		await seedUser(0);
		await seedSession(SESSION_ID, ADDRESS_ALLOWANCE);
		await ctx.db
			.update(table.guestSession)
			.set({ convertedToUserId: USER_ID })
			.where(eq(table.guestSession.id, SESSION_ID));

		const response = await guestGenerate({ guestSession: null, ip: GUEST_IP });

		expect(response.status).toBe(200);
		expect(await allJobCount()).toBe(1);
	});
});
