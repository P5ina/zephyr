/**
 * Credit invariants for the single-view regenerate on the rotate (8-direction) path.
 *
 * Two things are under test.
 *
 *  1. The charge. `locals.user` is a snapshot the auth hook loads once per
 *     request, so N requests that arrive together all carry the balance as it
 *     stood before any of them deducted. The tests reproduce that literally —
 *     N snapshots are read from the database first, then each is handed to its
 *     own handler invocation. An unconditional `tokens = tokens - cost`
 *     overdraws deterministically; a charge whose WHERE carries the balance
 *     predicate cannot.
 *
 *  2. The refund. This endpoint charges per request and records nothing on the
 *     job row, so the compensating credit has to return exactly what this
 *     request took — once. The failure path used to refund inside the `try` and
 *     then rethrow into its own `catch`, which paid the same charge back twice.
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

vi.mock('$env/dynamic/private', () => ({ env: { FAL_KEY: 'test-fal-key' } }));

vi.mock('@fal-ai/client', () => ({
	fal: {
		config: vi.fn(),
		subscribe: vi.fn(async () => ({
			data: { rotated: { url: 'https://blob.test/regenerated.png' } },
		})),
	},
}));

const { fal } = await import('@fal-ai/client');
const { POST } = await import('./+server');

const USER_ID = 'user-1';
const JOB_ID = 'job-1';
const TOKEN_COST = PRICING.tokenCosts.rotationSingleView;
const CONCURRENT_REQUESTS = 10;

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

type RegenerateEvent = {
	params: { id: string };
	request: Request;
	locals: { user: UserSnapshot | null };
};

let ctx: TestDatabase;

function regenerate(user: UserSnapshot | null): Promise<Response> {
	return (POST as unknown as (e: RegenerateEvent) => Promise<Response>)({
		params: { id: JOB_ID },
		request: new Request(`http://localhost/api/rotate/${JOB_ID}/regenerate`, {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({
				targetDirection: 'e',
				sourceDirection: 'input',
			}),
		}),
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
	await ctx.db.insert(table.rotationJob).values({
		id: JOB_ID,
		userId: USER_ID,
		status: 'completed',
		inputImageUrl: 'https://blob.test/input.png',
		tokenCost: 500,
		bonusTokenCost: 0,
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
		.from(table.rotationJob)
		.where(eq(table.rotationJob.id, JOB_ID));
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
	vi.mocked(fal.subscribe).mockResolvedValue({
		data: { rotated: { url: 'https://blob.test/regenerated.png' } },
	} as never);
});

describe('POST /api/rotate/[id]/regenerate — credit', () => {
	it('rejects a user who cannot afford a view and deducts nothing', async () => {
		await seedUser(TOKEN_COST - 1);
		await seedCompletedJob();

		await expect(regenerate(await loadSnapshot())).rejects.toMatchObject({
			status: 402,
		});

		expect(await balance()).toBe(TOKEN_COST - 1);
		expect(vi.mocked(fal.subscribe)).not.toHaveBeenCalled();
	});

	it('spends exactly one view worth of credit on one request', async () => {
		await seedUser(TOKEN_COST);
		await seedCompletedJob();

		const response = await regenerate(await loadSnapshot());

		expect(response.status).toBe(200);
		expect(await balance()).toBe(0);
		expect((await jobRow()).rotationE).toBe(
			'https://blob.test/regenerated.png',
		);
	});

	// The money invariant. Ten requests carrying the same pre-deduction snapshot
	// must never spend credit the account does not have.
	it('never lets concurrent regenerates overdraw the balance', async () => {
		await seedUser(TOKEN_COST);
		await seedCompletedJob();

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => regenerate(user)));

		expect(await balance()).toBe(0);
		expect(await balance()).toBeGreaterThanOrEqual(0);
	});

	it('reports the balances the charge left behind, not snapshot arithmetic', async () => {
		await seedUser(TOKEN_COST, 2);
		await seedCompletedJob();

		const body = await (await regenerate(await loadSnapshot())).json();

		// Bonus is spent first, so 2 of the cost comes out of the bonus bucket.
		expect(await buckets()).toEqual({ tokens: 2, bonus: 0 });
		expect(body.tokensRemaining).toBe(2);
		expect(body.bonusTokensRemaining).toBe(0);
	});
});

describe('POST /api/rotate/[id]/regenerate — refund', () => {
	// One charge, one refund. The old shape refunded inside the `try` and then
	// threw into its own `catch`, which refunded a second time and handed the
	// user free credit.
	it('returns each bucket exactly once when fal.ai yields no image', async () => {
		await seedUser(TOKEN_COST, 2);
		await seedCompletedJob();
		vi.mocked(fal.subscribe).mockResolvedValue({ data: {} } as never);

		await expect(regenerate(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		expect(await buckets()).toEqual({ tokens: TOKEN_COST, bonus: 2 });
	});

	it('returns each bucket exactly once when fal.ai throws', async () => {
		await seedUser(TOKEN_COST, 2);
		await seedCompletedJob();
		vi.mocked(fal.subscribe).mockRejectedValue(new Error('fal down'));
		const quiet = vi.spyOn(console, 'error').mockImplementation(() => {});

		await expect(regenerate(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		quiet.mockRestore();

		expect(await buckets()).toEqual({ tokens: TOKEN_COST, bonus: 2 });
	});

	// The delivered rotation is not this request's to fail or to pay back: its
	// token_cost is the original eight-view generation, and the user still holds
	// the asset.
	it('leaves the completed job alone when a view fails', async () => {
		await seedUser(TOKEN_COST);
		await seedCompletedJob();
		vi.mocked(fal.subscribe).mockResolvedValue({ data: {} } as never);

		await expect(regenerate(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		const job = await jobRow();
		expect(job.status).toBe('completed');
		expect(job.tokenCost).toBe(500);
	});
});
