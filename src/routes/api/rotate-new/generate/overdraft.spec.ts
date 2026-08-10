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
 *     generationsUsed = 0. The cap has to be consulted before the session is
 *     minted, against something the client cannot discard.
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

	// Baseline: the cookie-carrying path does honour the cap. This one holds
	// already, and it is what makes the two below meaningful — the rule exists,
	// it is just trivially opted out of.
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

	// The invariant. A caller that never sends the cookie is still one anonymous
	// visitor and must still be capped. Minting a fresh session per call gives
	// every request generationsUsed = 0, so the cap would never bind.
	it('caps an anonymous caller that never sends a guest session', async () => {
		const attempts = GUEST_CONFIG.maxGenerations + 2;

		let accepted = 0;
		for (let i = 0; i < attempts; i++) {
			try {
				const response = await guestGenerate({ guestSession: null });
				if (response.status === 200) accepted++;
			} catch {
				// 429 once the cap is enforced — that is the point of the test.
			}
		}

		expect(accepted).toBeLessThanOrEqual(GUEST_CONFIG.maxGenerations);
		expect(await allJobCount()).toBeLessThanOrEqual(
			GUEST_CONFIG.maxGenerations,
		);
	});

	// The ip_address column is written on every guest session. If the quota is
	// enforced against it, an exhausted address cannot buy more generations by
	// dropping its cookie.
	it('consults the recorded ip address when a caller drops its cookie', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

		await expect(
			guestGenerate({ guestSession: null, ip: GUEST_IP }),
		).rejects.toMatchObject({ status: 429 });

		expect(await allJobCount()).toBe(0);
	});

	// The cap is per address, so an unrelated visitor is unaffected by it.
	it('lets a different address through when one address is exhausted', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

		const response = await guestGenerate({
			guestSession: null,
			ip: '198.51.100.4',
		});

		expect(response.status).toBe(200);
	});
});
