/**
 * Money invariants for token deduction on the spin generate path.
 *
 * These are written against the behaviour the code MUST have. The concurrency
 * tests are red for any implementation that checks `locals.user` and then
 * deducts unconditionally, and green only when the affordability predicate
 * lives in the WHERE of the write.
 *
 * Note on faithfulness: `locals.user` is a snapshot the auth hook loads once
 * per request, so N requests that arrive together all carry the balance as it
 * stood before any of them deducted. The tests reproduce that literally — they
 * read N snapshots from the database first, then hand each one to its own
 * handler invocation. No interleaving luck is required: an unconditional
 * `tokens = tokens - cost` overdraws deterministically.
 *
 * Guests are the other half of the contract on this endpoint: a spin costs an
 * anonymous visitor nothing, so the charge must never run for them.
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
	submitSpinJob: vi.fn(async () => ({ requestId: 'fal-req-test' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

const { submitSpinJob } = await import('$lib/server/fal');
const { POST } = await import('./+server');

/** 1x1 PNG — real bytes, so the handler's sharp pipeline runs for real. */
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const USER_ID = 'user-spin-1';
const GUEST_IP = '203.0.113.9';
const TOKEN_COST = PRICING.tokenCosts.spin;
const CONCURRENT_REQUESTS = 10;

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

type SpinEvent = {
	request: Request;
	locals: {
		user: UserSnapshot | null;
		guestSession: table.GuestSession | null;
	};
	getClientAddress: () => string;
};

let ctx: TestDatabase;

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

function generateRequest(user: UserSnapshot): Promise<Response> {
	return (POST as unknown as (event: SpinEvent) => Promise<Response>)({
		request: imageRequest(),
		locals: { user, guestSession: null },
		getClientAddress: () => GUEST_IP,
	});
}

function generateAsGuest(
	guestSession: table.GuestSession | null,
): Promise<Response> {
	return (POST as unknown as (event: SpinEvent) => Promise<Response>)({
		request: imageRequest(),
		locals: { user: null, guestSession },
		getClientAddress: () => GUEST_IP,
	});
}

async function seedUser(tokens: number, bonusTokens = 0) {
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'spin@example.com',
		tokens,
		bonusTokens,
	});
}

async function seedGuestSession(id: string): Promise<table.GuestSession> {
	const [row] = await ctx.db
		.insert(table.guestSession)
		.values({
			id,
			ipAddress: GUEST_IP,
			generationsUsed: 0,
			expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
		})
		.returning();
	return row;
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
		.from(table.spinJob)
		.where(eq(table.spinJob.userId, USER_ID));
}

function allJobs() {
	return ctx.db.select().from(table.spinJob);
}

describe('POST /api/spin/generate — token charging', () => {
	beforeAll(async () => {
		ctx = await createTestDatabase();
		holder.db = ctx.db;
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	beforeEach(async () => {
		await ctx.reset();
		vi.mocked(submitSpinJob).mockResolvedValue({ requestId: 'fal-req-test' });
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

		expect(await balance()).toBeGreaterThanOrEqual(0);
		expect(await balance()).toBe(0);
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

	// The job row is what a later refund reads, so the split it records has to be
	// the split that was actually taken — and the response has to report the row,
	// not the stale snapshot's arithmetic.
	it('records the charged split on the job and reports the row balances', async () => {
		const bonus = 10;
		await seedUser(TOKEN_COST, bonus);

		const response = await generateRequest(await loadSnapshot());
		const body = (await response.json()) as {
			tokensRemaining: number;
			bonusTokensRemaining: number;
		};

		const [job] = await jobs();
		expect(job.tokenCost).toBe(TOKEN_COST);
		expect(job.bonusTokenCost).toBe(bonus);

		// Bonus is spent first, so the purchased bucket covers only the remainder.
		const regularDeduct = TOKEN_COST - bonus;
		const after = await buckets();
		expect(after.bonus).toBe(0);
		expect(after.tokens).toBe(TOKEN_COST - regularDeduct);
		expect(body.tokensRemaining).toBe(after.tokens);
		expect(body.bonusTokensRemaining).toBe(after.bonus);
	});

	// Submission failure must put the money back in the buckets it came from,
	// and must not leave a pending job behind.
	it('refunds both buckets when fal submission fails', async () => {
		const bonus = 10;
		await seedUser(TOKEN_COST, bonus);
		vi.mocked(submitSpinJob).mockRejectedValue(new Error('fal is down'));

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		const after = await buckets();
		expect(after.tokens).toBe(TOKEN_COST);
		expect(after.bonus).toBe(bonus);

		const [job] = await jobs();
		expect(job.status).toBe('failed');
	});

	// Guests pay nothing on this endpoint, so the charge must not run for them:
	// no balance is touched and the job is recorded as free.
	it('charges nothing for a guest generation', async () => {
		await seedUser(TOKEN_COST);
		const guestSession = await seedGuestSession('guest-spin-1');

		const response = await generateAsGuest(guestSession);

		expect(response.status).toBe(200);
		expect(await balance()).toBe(TOKEN_COST);
		expect(await jobs()).toHaveLength(0);

		const [job] = await allJobs();
		expect(job.tokenCost).toBe(0);
		expect(job.bonusTokenCost).toBe(0);
	});
});
