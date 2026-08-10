/**
 * Invariants for token deduction on the texture generate path.
 *
 * These are written against the behaviour the code MUST have, not the
 * behaviour it has today. The concurrency test is expected to be red until the
 * deduction becomes an atomic conditional claim (an UPDATE with a balance
 * predicate, or a CHECK constraint) instead of a check against `locals.user`
 * followed by an unconditional decrement.
 *
 * Note on faithfulness: `locals.user` is a snapshot the auth hook loads once
 * per request, so N requests that arrive together all carry the balance as it
 * stood before any of them deducted. The test reproduces that literally — it
 * reads N snapshots from the database first, then hands each one to its own
 * handler invocation. No interleaving luck is required: every invocation
 * issues an unconditional `tokens = tokens - cost`, so the overdraft is
 * deterministic.
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
import {
	createTestDatabase,
	type TestDatabase,
} from '$lib/server/db/test-harness';
import * as table from '$lib/server/db/schema';

const holder = vi.hoisted(() => ({ db: null as unknown }));

vi.mock('$lib/server/db', () => ({
	db: new Proxy(
		{},
		{
			get: (_t, prop) => (holder.db as Record<string | symbol, unknown>)[prop],
		},
	),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));

vi.mock('$lib/server/runpod', () => ({
	submitTextureJob: vi.fn(async ({ jobId }: { jobId: string }) => ({
		id: `runpod-${jobId}`,
	})),
}));

const { POST } = await import('./+server');

const USER_ID = 'user-1';
const TOKEN_COST = PRICING.tokenCosts.texture;
const CONCURRENT_REQUESTS = 10;

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

let ctx: TestDatabase;

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

function generateRequest(user: UserSnapshot) {
	return (
		POST as unknown as (event: {
			request: Request;
			locals: { user: UserSnapshot };
		}) => Promise<Response>
	)({
		request: new Request('http://localhost/api/textures/generate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ prompt: 'mossy stone wall' }),
		}),
		locals: { user },
	});
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

function generations() {
	return ctx.db
		.select()
		.from(table.textureGeneration)
		.where(eq(table.textureGeneration.userId, USER_ID));
}

describe('POST /api/textures/generate', () => {
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
		expect(await generations()).toHaveLength(0);
	});

	it('spends exactly one generation worth of credit on one request', async () => {
		await seedUser(TOKEN_COST);

		await generateRequest(await loadSnapshot());

		expect(await balance()).toBe(0);
		expect(await generations()).toHaveLength(1);
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

	// The other half of the same invariant: credit for one generation must buy
	// one generation, not ten.
	it('grants exactly one generation for one generation worth of credit', async () => {
		await seedUser(TOKEN_COST);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await generations()).toHaveLength(1);
	});
});
