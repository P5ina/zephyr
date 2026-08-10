/**
 * Credit invariants for the animation re-export.
 *
 * Re-export is the most expensive of the three per-request charges, and it was
 * the worst overdraft: `locals.user` is a snapshot the auth hook loads once per
 * request, so N requests that arrive together all carry the balance as it stood
 * before any of them deducted. Three re-exports at 139 tokens each against a
 * 139-token balance left `tokens = -278`. The tests below reproduce that
 * literally — they read N snapshots from the database first, then hand each one
 * to its own handler invocation. No interleaving luck is required: an
 * unconditional `tokens = tokens - cost` overdraws deterministically, while a
 * charge whose WHERE carries the balance predicate cannot.
 *
 * The second half covers the write that follows the charge. Re-export stamps
 * its own cost over the shared job row's `token_cost`, and that row is what
 * `/api/animate/[id]/cancel` and the fal webhook refund from. So the
 * `completed -> processing` transition has to be claimed, not written blind:
 * two re-exports that both stamp their cost would have taken twice the money
 * the row records, and a later refund would pay back half of it.
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
import { getAnimationReprocessTokenCost } from '$lib/pricing';
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

const { POST } = await import('./+server');

const USER_ID = 'user-1';
const JOB_ID = 'job-1';
const FRAME_COUNT = 32;
const DIRECTION_COUNT = 4;
const CONCURRENT_REQUESTS = 3;

/** 139 with today's pricing — the figure the overdraft was proven at. */
const REEXPORT_COST = getAnimationReprocessTokenCost(
	FRAME_COUNT,
	DIRECTION_COUNT,
);

/** What the original generation was charged, and what the row starts at. */
const ORIGINAL_COST = 900;
const ORIGINAL_BONUS_COST = 100;

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

type ReexportEvent = {
	params: { id: string };
	locals: { user: UserSnapshot | null };
};

let ctx: TestDatabase;

function reexport(user: UserSnapshot | null): Promise<Response> {
	return (POST as unknown as (e: ReexportEvent) => Promise<Response>)({
		params: { id: JOB_ID },
		locals: { user },
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

async function seedCompletedJob() {
	await ctx.db.insert(table.animationJob).values({
		id: JOB_ID,
		userId: USER_ID,
		status: 'completed',
		animationType: 'run',
		elevation: 'side',
		directionCount: DIRECTION_COUNT,
		frameCount: FRAME_COUNT,
		directionVideos: { n: 'https://blob.test/n.mp4' },
		spritesheetUrl: 'https://blob.test/sheet.png',
		tokenCost: ORIGINAL_COST,
		bonusTokenCost: ORIGINAL_BONUS_COST,
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

async function jobRow() {
	const [row] = await ctx.db
		.select()
		.from(table.animationJob)
		.where(eq(table.animationJob.id, JOB_ID));
	return row;
}

beforeAll(async () => {
	ctx = await createTestDatabase();
	holder.db = ctx.db;
}, 120_000);

afterAll(async () => {
	await ctx?.close();
});

beforeEach(async () => {
	await ctx.reset();
});

describe('POST /api/animate/[id]/reexport — credit', () => {
	it('rejects a user who cannot afford the re-export and deducts nothing', async () => {
		await seedUser(REEXPORT_COST - 1);
		await seedCompletedJob();

		await expect(reexport(await loadSnapshot())).rejects.toMatchObject({
			status: 402,
		});

		expect(await balance()).toBe(REEXPORT_COST - 1);

		// Nothing was claimed, so the delivered animation is untouched.
		const job = await jobRow();
		expect(job.status).toBe('completed');
		expect(job.tokenCost).toBe(ORIGINAL_COST);
	});

	it('spends exactly one re-export worth of credit on one request', async () => {
		await seedUser(REEXPORT_COST);
		await seedCompletedJob();

		const response = await reexport(await loadSnapshot());

		expect(response.status).toBe(200);
		expect(await balance()).toBe(0);
		expect((await jobRow()).status).toBe('processing');
	});

	// The money invariant. Three requests carrying the same pre-deduction
	// snapshot must never spend credit the account does not have: the balance
	// floor is 0, never negative. This is the case that produced -278.
	it('never lets concurrent re-exports overdraw the balance', async () => {
		await seedUser(REEXPORT_COST);
		await seedCompletedJob();

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => reexport(user)));

		expect(await balance()).toBe(0);
		expect(await balance()).toBeGreaterThanOrEqual(0);
	});

	it('reports the balances the charge left behind, not snapshot arithmetic', async () => {
		await seedUser(REEXPORT_COST, 5);
		await seedCompletedJob();

		const response = await reexport(await loadSnapshot());
		const body = await response.json();

		// Bonus is spent first: 5 of the cost comes out of the bonus bucket and
		// the remaining REEXPORT_COST - 5 out of the purchased one, which leaves
		// the purchased bucket holding 5.
		expect(await buckets()).toEqual({ tokens: 5, bonus: 0 });
		expect(body.tokensRemaining).toBe(5);
		expect(body.bonusTokensRemaining).toBe(0);
	});

	// The row is the only record of what a refund owes while the re-export is in
	// flight: /api/animate/[id]/cancel and the fal webhook both credit back
	// `token_cost`. What they owe is this re-export, not the animation the user
	// already received, and the bucket split has to be the one the charge took.
	it('records the re-export cost and the split the charge actually took', async () => {
		await seedUser(REEXPORT_COST, 5);
		await seedCompletedJob();

		await reexport(await loadSnapshot());

		const job = await jobRow();
		expect(job.tokenCost).toBe(REEXPORT_COST);
		expect(job.bonusTokenCost).toBe(5);
	});
});

describe('POST /api/animate/[id]/reexport — claiming the re-export', () => {
	// Only one request may take the job out of `completed`, and every request
	// that does not must keep its money. Stated as an identity so it holds under
	// any interleaving: the balance may only fall by the cost of the re-exports
	// that were actually started.
	it('charges only the requests that win the completed -> processing claim', async () => {
		const funded = REEXPORT_COST * CONCURRENT_REQUESTS;
		await seedUser(funded);
		await seedCompletedJob();

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		const outcomes = await Promise.allSettled(
			snapshots.map((user) => reexport(user)),
		);

		const accepted = outcomes.filter(
			(o) => o.status === 'fulfilled' && o.value.status === 200,
		).length;

		expect(accepted).toBe(1);
		expect(funded - (await balance())).toBe(accepted * REEXPORT_COST);

		// And the row records exactly what was taken, so a cancel or a failure
		// webhook pays back the whole charge rather than a fraction of it.
		expect((await jobRow()).tokenCost).toBe(REEXPORT_COST);
	});

	it('refuses a job that is not completed without charging for it', async () => {
		await seedUser(REEXPORT_COST);
		await seedCompletedJob();
		await ctx.db
			.update(table.animationJob)
			.set({ status: 'processing' })
			.where(eq(table.animationJob.id, JOB_ID));

		await expect(reexport(await loadSnapshot())).rejects.toMatchObject({
			status: 400,
		});

		expect(await balance()).toBe(REEXPORT_COST);
	});
});
