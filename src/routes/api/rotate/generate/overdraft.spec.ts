/**
 * Money and quota invariants for POST /api/rotate/generate.
 *
 * Two holes are covered here, both of the same shape: a check made against a
 * value the caller controls or that was read before the write.
 *
 * 1. Token deduction. `locals.user` is a snapshot the auth hook loads once per
 *    request, so N requests that arrive together all carry the balance as it
 *    stood before any of them deducted. The concurrency tests reproduce that
 *    literally — N snapshots are read from the database first, then each is
 *    handed to its own handler invocation. No interleaving luck is required:
 *    an unconditional `tokens = tokens - cost` overdraws deterministically.
 *
 * 2. Guest quota. When no cookie arrives the handler used to mint a session and
 *    then ask whether that session had rotations left — a brand new session owns
 *    none, so the cap only ever bound on callers who volunteered their cookie.
 *    The recorded ip address is what makes it bind on the rest.
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
	env: { BLOB_READ_WRITE_TOKEN: 'test-blob-token', FAL_KEY: 'test-fal-key' },
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async (pathname: string) => ({
		url: `https://blob.test/${pathname}`,
		pathname,
	})),
}));

vi.mock('$lib/server/fal', () => ({
	submitRotation8DirJob: vi.fn(async () => ({ requestId: 'fal-req-test' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

vi.mock('$lib/server/posthog', () => ({
	getPostHogClient: () => ({ capture: vi.fn(), flush: vi.fn(async () => {}) }),
}));

const { POST } = await import('./+server');

const USER_ID = 'user-1';
const GUEST_IP = '203.0.113.7';
const SESSION_ID = 'guest-session-1';
const TOKEN_COST = PRICING.tokenCosts.rotation;
const CONCURRENT_REQUESTS = 10;
const IMAGE_URL = 'https://blob.test/input.png';

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
	return new Request('http://localhost/api/rotate/generate', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ imageUrl: IMAGE_URL, elevation: 0 }),
	});
}

function generateAs(locals: GenerateEvent['locals'], ip = GUEST_IP) {
	return (POST as unknown as (event: GenerateEvent) => Promise<Response>)({
		request: rotateRequest(),
		locals,
		getClientAddress: () => ip,
	});
}

function generateRequest(user: UserSnapshot) {
	return generateAs({ user, guestSession: null });
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

async function balance() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

function rotations() {
	return ctx.db
		.select()
		.from(table.rotationJob)
		.where(eq(table.rotationJob.userId, USER_ID));
}

async function allJobCount() {
	const rows = await ctx.db
		.select({ id: table.rotationJob.id })
		.from(table.rotationJob);
	return rows.length;
}

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

describe('POST /api/rotate/generate', () => {
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
		expect(await rotations()).toHaveLength(0);
	});

	it('spends exactly one rotation worth of credit on one request', async () => {
		await seedUser(TOKEN_COST);

		const response = await generateRequest(await loadSnapshot());
		const body = await response.json();

		expect(await balance()).toBe(0);
		expect(await rotations()).toHaveLength(1);
		// Reported from the row the charge left behind, not from the stale snapshot.
		expect(body.tokensRemaining).toBe(0);
		expect(body.bonusTokensRemaining).toBe(0);
	});

	// The bonus bucket is spent first, and the split is recorded on the job so a
	// later refund puts each part back where it came from.
	it('records the bonus/regular split the charge actually made', async () => {
		await seedUser(TOKEN_COST, 4);

		await generateRequest(await loadSnapshot());

		const [job] = await rotations();
		expect(job.bonusTokenCost).toBe(4);
		expect(job.tokenCost).toBe(TOKEN_COST);
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
	});

	// The other half of the same invariant: credit for one rotation must buy one
	// rotation, not ten.
	it('grants exactly one rotation for one rotation worth of credit', async () => {
		await seedUser(TOKEN_COST);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await rotations()).toHaveLength(1);
	});

	// Refund on submission failure returns exactly what was taken — no more, and
	// to the bucket it came from.
	it('refunds the charge when submission fails', async () => {
		await seedUser(TOKEN_COST, 4);
		const fal = await import('$lib/server/fal');
		vi.mocked(fal.submitRotation8DirJob).mockRejectedValueOnce(
			new Error('fal is down'),
		);

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		expect(await balance()).toBe(TOKEN_COST + 4);
		const [job] = await rotations();
		expect(job.status).toBe('failed');
	});
});

describe('POST /api/rotate/generate — guest quota', () => {
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

	// Baseline: the cookie-carrying path does honour the cap. This one is what
	// makes the two below meaningful — the rule exists, it is just trivially
	// opted out of when the cookie is withheld.
	it('cuts a cookie-carrying guest off after maxRotationGenerations', async () => {
		await seedSession(SESSION_ID, 0);

		for (let i = 0; i < GUEST_CONFIG.maxRotationGenerations; i++) {
			const response = await generateAs({
				user: null,
				guestSession: await loadSession(SESSION_ID),
			});
			expect(response.status).toBe(200);
		}

		await expect(
			generateAs({ user: null, guestSession: await loadSession(SESSION_ID) }),
		).rejects.toMatchObject({ status: 429 });

		expect(await allJobCount()).toBe(GUEST_CONFIG.maxRotationGenerations);
	});

	// The invariant. A caller that never sends the cookie is still one anonymous
	// visitor and must still be capped by something it cannot discard.
	it('caps an anonymous caller that never sends a guest session', async () => {
		const attempts = GUEST_CONFIG.maxGenerations + 2;

		let accepted = 0;
		for (let i = 0; i < attempts; i++) {
			try {
				const response = await generateAs({ user: null, guestSession: null });
				if (response.status === 200) accepted++;
			} catch {
				// 429 once the cap binds — that is the point of the test.
			}
		}

		expect(accepted).toBeLessThanOrEqual(GUEST_CONFIG.maxGenerations);
		expect(await allJobCount()).toBeLessThanOrEqual(
			GUEST_CONFIG.maxGenerations,
		);
	});

	// An exhausted address cannot buy more free rotations by dropping its cookie.
	it('consults the recorded ip address when a caller drops its cookie', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

		await expect(
			generateAs({ user: null, guestSession: null }, GUEST_IP),
		).rejects.toMatchObject({ status: 429 });

		expect(await allJobCount()).toBe(0);
	});

	// A different address is a different visitor: the backstop must not spill
	// one caller's exhaustion onto everyone else.
	it('lets a different address through when one address is exhausted', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

		const response = await generateAs(
			{ user: null, guestSession: null },
			'198.51.100.4',
		);

		expect(response.status).toBe(200);
	});
});
