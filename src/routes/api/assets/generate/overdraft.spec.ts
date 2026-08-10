/**
 * Invariants for POST /api/assets/generate.
 *
 * Two rules are asserted here, both written against the behaviour the endpoint
 * MUST have rather than any particular implementation of it.
 *
 * 1. Money. `locals.user` is a snapshot the auth hook loads once per request,
 *    so N requests that arrive together all carry the balance as it stood
 *    before any of them deducted. The concurrency tests reproduce that
 *    literally — N snapshots are read from the database first, then each is
 *    handed to its own handler invocation. No interleaving luck is required:
 *    an implementation that checks the snapshot and then decrements
 *    unconditionally overdraws deterministically.
 *
 * 2. Guest quota. The per-session counter alone enforces nothing, because a
 *    caller that sends no cookie is handed a brand-new session with
 *    generationsUsed = 0 and `0 < cap` is always true. The cap has to be tested
 *    against something the client cannot discard — the recorded ip address —
 *    before the session is minted.
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

vi.mock('$env/dynamic/private', () => ({ env: {} }));

vi.mock('$lib/server/fal', () => ({
	submitSpriteJob: vi.fn(async () => ({ requestId: 'fal-req-test' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

vi.mock('$lib/server/posthog', () => ({
	getPostHogClient: vi.fn(() => ({
		capture: vi.fn(),
		flush: vi.fn(async () => {}),
	})),
}));

const { POST } = await import('./+server');

const USER_ID = 'user-1';
const TOKEN_COST = PRICING.tokenCosts.sprite;
const CONCURRENT_REQUESTS = 10;
const GUEST_IP = '203.0.113.7';
const SESSION_ID = 'guest-session-1';

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

type GenerateEvent = {
	request: Request;
	locals: {
		user: UserSnapshot | null;
		guestSession?: table.GuestSession | null;
	};
	getClientAddress: () => string;
};

let ctx: TestDatabase;

function assetRequest(): Request {
	return new Request('http://localhost/api/assets/generate', {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({ assetType: 'sprite', prompt: 'a brass lantern' }),
	});
}

function generate(options: {
	user?: UserSnapshot | null;
	guestSession?: table.GuestSession | null;
	ip?: string;
}): Promise<Response> {
	return (POST as unknown as (event: GenerateEvent) => Promise<Response>)({
		request: assetRequest(),
		locals: {
			user: options.user ?? null,
			guestSession: options.guestSession ?? null,
		},
		getClientAddress: () => options.ip ?? GUEST_IP,
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
		.from(table.assetGeneration)
		.where(eq(table.assetGeneration.userId, USER_ID));
}

async function assetCount(): Promise<number> {
	const rows = await ctx.db
		.select({ id: table.assetGeneration.id })
		.from(table.assetGeneration);
	return rows.length;
}

describe('POST /api/assets/generate', () => {
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

	describe('token deduction', () => {
		it('rejects a user who cannot afford the cost and deducts nothing', async () => {
			await seedUser(TOKEN_COST - 1);

			await expect(
				generate({ user: await loadSnapshot() }),
			).rejects.toMatchObject({ status: 402 });

			expect(await balance()).toBe(TOKEN_COST - 1);
			expect(await generations()).toHaveLength(0);
		});

		it('spends exactly one generation worth of credit on one request', async () => {
			await seedUser(TOKEN_COST);

			const response = await generate({ user: await loadSnapshot() });

			expect(response.status).toBe(200);
			expect(await balance()).toBe(0);
			expect(await generations()).toHaveLength(1);
		});

		// The reported balance has to come from the row the charge wrote, not from
		// arithmetic on the stale snapshot — otherwise a client can be told it has
		// credit left while the row says otherwise.
		it('reports the balance the charge actually left behind', async () => {
			await seedUser(TOKEN_COST + 5, 2);
			const snapshot = await loadSnapshot();

			// A second request lands between the snapshot and this one, so the
			// snapshot's arithmetic and the row have already diverged.
			await generate({ user: snapshot });
			const response = await generate({ user: snapshot });
			const payload = (await response.json()) as {
				tokensUsed: number;
				tokensRemaining: number;
				bonusTokensRemaining: number;
				totalTokensRemaining: number;
			};

			expect(payload.tokensUsed).toBe(TOKEN_COST);
			expect(payload.tokensRemaining + payload.bonusTokensRemaining).toBe(
				await balance(),
			);
			expect(payload.totalTokensRemaining).toBe(await balance());
		});

		// The job row records the split so a later refund restores the right
		// buckets; taking it from the snapshot would record a split that never
		// happened once a concurrent request drained the bonus bucket first.
		it('records the split that was actually charged on the job row', async () => {
			await seedUser(TOKEN_COST, TOKEN_COST);
			const snapshot = await loadSnapshot();

			await generate({ user: snapshot });
			await generate({ user: snapshot });

			const rows = await generations();
			const bonusCharged = rows.reduce((sum, r) => sum + r.bonusTokenCost, 0);

			expect(rows).toHaveLength(2);
			expect(bonusCharged).toBe(TOKEN_COST);
			expect(await balance()).toBe(0);
		});

		// The money invariant. Ten requests carrying the same pre-deduction
		// snapshot must never spend credit the account does not have: the balance
		// floor is 0, never negative, no matter how the requests interleave.
		it('never lets concurrent generates overdraw the balance', async () => {
			await seedUser(TOKEN_COST);

			const snapshots = await Promise.all(
				Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
			);
			await Promise.allSettled(snapshots.map((user) => generate({ user })));

			expect(await balance()).toBe(0);
		});

		// The other half of the same invariant: credit for one generation must buy
		// one generation, not ten.
		it('grants exactly one generation for one generation worth of credit', async () => {
			await seedUser(TOKEN_COST);

			const snapshots = await Promise.all(
				Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
			);
			await Promise.allSettled(snapshots.map((user) => generate({ user })));

			expect(await generations()).toHaveLength(1);
		});

		// A failed submission must put the credit back where it came from, and put
		// back exactly one generation's worth.
		it('refunds the charged buckets when submission fails', async () => {
			await seedUser(TOKEN_COST, TOKEN_COST);
			const fal = await import('$lib/server/fal');
			vi.mocked(fal.submitSpriteJob).mockRejectedValueOnce(
				new Error('fal is down'),
			);

			await expect(
				generate({ user: await loadSnapshot() }),
			).rejects.toMatchObject({ status: 500 });

			const [row] = await ctx.db
				.select({
					tokens: table.user.tokens,
					bonus: table.user.bonusTokens,
				})
				.from(table.user)
				.where(eq(table.user.id, USER_ID));

			expect(row.tokens).toBe(TOKEN_COST);
			expect(row.bonus).toBe(TOKEN_COST);
			expect((await generations())[0].status).toBe('failed');
		});
	});

	describe('guest quota', () => {
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

		// Baseline: the cookie-carrying path honours the cap. It is what makes the
		// two below meaningful — the rule exists, it is just opted out of.
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

			expect(await assetCount()).toBe(GUEST_CONFIG.maxGenerations);
		});

		// The invariant. A caller that never sends the cookie is still one
		// anonymous visitor and must still be capped.
		it('caps an anonymous caller that never sends a guest session', async () => {
			const attempts = GUEST_CONFIG.maxGenerations + 2;

			let accepted = 0;
			for (let i = 0; i < attempts; i++) {
				try {
					const response = await generate({ guestSession: null });
					if (response.status === 200) accepted++;
				} catch {
					// 429 once the cap is enforced — that is the point of the test.
				}
			}

			expect(accepted).toBeLessThanOrEqual(GUEST_CONFIG.maxGenerations);
			expect(await assetCount()).toBeLessThanOrEqual(
				GUEST_CONFIG.maxGenerations,
			);
		});

		// An exhausted address cannot buy more generations by dropping its cookie.
		it('consults the recorded ip address when a caller drops its cookie', async () => {
			await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

			await expect(
				generate({ guestSession: null, ip: GUEST_IP }),
			).rejects.toMatchObject({ status: 429 });

			expect(await assetCount()).toBe(0);
		});

		// The cap is per address, so an unrelated visitor is unaffected.
		it('lets a different address generate after another is exhausted', async () => {
			await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

			const response = await generate({
				guestSession: null,
				ip: '198.51.100.4',
			});

			expect(response.status).toBe(200);
			expect(await assetCount()).toBe(1);
		});
	});
});
