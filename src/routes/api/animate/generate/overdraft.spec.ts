/**
 * Invariants for token deduction on the animate generate path.
 *
 * These are written against the behaviour the code MUST have, not the
 * behaviour it had. The concurrency tests were red until the deduction became
 * an atomic conditional claim (an UPDATE whose WHERE carries the balance
 * predicate) instead of a check against `locals.user` followed by an
 * unconditional decrement.
 *
 * Note on faithfulness: `locals.user` is a snapshot the auth hook loads once
 * per request, so N requests that arrive together all carry the balance as it
 * stood before any of them deducted. The tests reproduce that literally — they
 * read N snapshots from the database first, then hand each one to its own
 * handler invocation. No interleaving luck is required: an unconditional
 * `tokens = tokens - cost` overdraws deterministically.
 *
 * The cost here is not a constant: getAnimationGenerationTokenCost(type,
 * directionCount) prices each request, so affordability is asserted against
 * the same function the handler calls rather than a copied number.
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
import { eq, sql } from 'drizzle-orm';
import { DIRECTIONS_4, DIRECTIONS_8 } from '$lib/animation-config';
import { getAnimationGenerationTokenCost } from '$lib/pricing';
import { claimJobAndRefund } from '$lib/server/credits';
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

const submitAnimateJob = vi.hoisted(() =>
	vi.fn(async () => ({ requestId: 'fal-req-test' })),
);

vi.mock('$lib/server/fal', () => ({ submitAnimateJob }));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

// posthog-node would open a real HTTP client on capture/flush.
vi.mock('$lib/server/posthog', () => ({
	getPostHogClient: () => ({
		capture: vi.fn(),
		flush: vi.fn(async () => undefined),
	}),
}));

const { POST } = await import('./+server');

const USER_ID = 'user-1';
const ANIMATION_TYPE = 'run';
const COST_4 = getAnimationGenerationTokenCost(ANIMATION_TYPE, 4);
const COST_8 = getAnimationGenerationTokenCost(ANIMATION_TYPE, 8);
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

function animateForm(directionCount: 4 | 8): FormData {
	const form = new FormData();
	form.append('animationType', ANIMATION_TYPE);
	form.append('elevation', 'iso');
	form.append('directionCount', String(directionCount));
	// Images reach the handler as Blob URLs; the browser uploads them directly.
	for (const dir of directionCount === 4 ? DIRECTIONS_4 : DIRECTIONS_8) {
		form.append(`imageUrl_${dir}`, `https://blob.test/${dir}.png`);
	}
	return form;
}

function generateRequest(
	user: UserSnapshot,
	directionCount: 4 | 8 = 4,
): Promise<Response> {
	return (
		POST as unknown as (event: {
			request: Request;
			locals: { user: UserSnapshot };
		}) => Promise<Response>
	)({
		request: new Request('http://localhost/api/animate/generate', {
			method: 'POST',
			body: animateForm(directionCount),
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

async function balances() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row;
}

async function balance() {
	const row = await balances();
	return row.tokens + row.bonus;
}

function jobs() {
	return ctx.db
		.select()
		.from(table.animationJob)
		.where(eq(table.animationJob.userId, USER_ID));
}

describe('POST /api/animate/generate', () => {
	beforeAll(async () => {
		ctx = await createTestDatabase();
		holder.db = ctx.db;
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	beforeEach(async () => {
		await ctx.reset();
		submitAnimateJob.mockClear();
		submitAnimateJob.mockImplementation(async () => ({
			requestId: 'fal-req-test',
		}));
	});

	it('rejects a user who cannot afford the cost and deducts nothing', async () => {
		await seedUser(COST_4 - 1);

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 402,
		});

		expect(await balance()).toBe(COST_4 - 1);
		expect(await jobs()).toHaveLength(0);
	});

	it('spends exactly one generation worth of credit on one request', async () => {
		await seedUser(COST_4);

		const response = await generateRequest(await loadSnapshot());

		expect(response.status).toBe(200);
		expect(await balance()).toBe(0);
		expect(await jobs()).toHaveLength(1);
	});

	// The cost is per-request, so affordability has to be judged against the
	// eight-direction price when eight directions are asked for. A balance that
	// covers four must not buy eight.
	it('prices eight directions higher and refuses a balance that only covers four', async () => {
		expect(COST_8).toBeGreaterThan(COST_4);
		await seedUser(COST_4);

		await expect(
			generateRequest(await loadSnapshot(), 8),
		).rejects.toMatchObject({ status: 402 });

		expect(await balance()).toBe(COST_4);
		expect(await jobs()).toHaveLength(0);
	});

	// The money invariant. Ten requests carrying the same pre-deduction snapshot
	// must never spend credit the account does not have: the balance floor is 0,
	// never negative, no matter how the requests interleave — and credit for one
	// generation must buy one generation, not ten.
	it('never lets concurrent generates overdraw the balance', async () => {
		await seedUser(COST_4);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await balance()).toBe(0);
	});

	it('grants exactly one generation for one generation worth of credit', async () => {
		await seedUser(COST_4);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await jobs()).toHaveLength(1);
	});

	// The balance the client is told it has must be the balance the row holds.
	// Derived from `locals.user` it was a snapshot's arithmetic, which reported
	// a comfortable remainder while the row went negative.
	it('reports the balance the row actually holds after a concurrent burst', async () => {
		await seedUser(COST_4);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		const settled = await Promise.allSettled(
			snapshots.map((user) => generateRequest(user)),
		);

		const bodies = await Promise.all(
			settled
				.filter((r) => r.status === 'fulfilled')
				.map((r) => r.value.json()),
		);

		expect(bodies).toHaveLength(1);
		const row = await balances();
		for (const body of bodies) {
			expect(body.tokensRemaining).toBe(row.tokens);
			expect(body.bonusTokensRemaining).toBe(row.bonus);
		}
	});

	// Bonus credit is spent first, and the split has to come from the charge:
	// the job row records it so a refund pays each bucket back correctly.
	it('spends bonus credit first and records the split on the job', async () => {
		const BONUS = 3;
		await seedUser(COST_4, BONUS);

		const response = await generateRequest(await loadSnapshot());
		const body = await response.json();

		const row = await balances();
		expect(row.bonus).toBe(0);
		expect(row.tokens).toBe(BONUS);
		expect(body.tokensRemaining).toBe(BONUS);
		expect(body.bonusTokensRemaining).toBe(0);

		const [job] = await jobs();
		expect(job.tokenCost).toBe(COST_4);
		expect(job.bonusTokenCost).toBe(BONUS);
	});

	// The fan-out submits one fal job per direction. When one of them fails the
	// whole request fails, and the refund must put back exactly what was taken —
	// into the same buckets it came from — and mark the job failed.
	it('refunds both buckets once when one direction fails to submit', async () => {
		const BONUS = 3;
		await seedUser(COST_4, BONUS);

		let calls = 0;
		submitAnimateJob.mockImplementation(async () => {
			calls += 1;
			if (calls === 2) throw new Error('fal.ai rejected the submission');
			return { requestId: `fal-req-${calls}` };
		});

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		const row = await balances();
		expect(row.tokens).toBe(COST_4);
		expect(row.bonus).toBe(BONUS);

		const [job] = await jobs();
		expect(job.status).toBe('failed');
		expect(job.errorMessage).toBe('Failed to submit animation jobs');
	});

	// The other half of the fan-out: one direction submits, its webhook comes
	// back failed and refunds the job, and only then does a sibling submission
	// throw. Both paths want to pay the cost back, so the refund has to be a
	// claim on the row's state — an unconditional credit pays twice, and the
	// user ends up richer than before they started.
	it('does not refund again when the job was already claimed and refunded', async () => {
		const BONUS = 3;
		await seedUser(COST_4, BONUS);

		let calls = 0;
		submitAnimateJob.mockImplementation(async () => {
			calls += 1;
			if (calls === 2) {
				// Stands in for the webhook that handles the first direction's
				// failure while the fan-out is still in flight.
				const [inFlight] = await jobs();
				await claimJobAndRefund({
					job: table.animationJob,
					jobId: inFlight.id,
					errorMessage: 'direction failed',
					claimableWhen: sql`status <> 'failed'`,
				});
				throw new Error('fal.ai rejected the submission');
			}
			return { requestId: `fal-req-${calls}` };
		});

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		// Refunded exactly once: back to the seeded balance, not above it.
		const row = await balances();
		expect(row.tokens).toBe(COST_4);
		expect(row.bonus).toBe(BONUS);
	});
});
