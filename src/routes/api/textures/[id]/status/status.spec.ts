/**
 * Refund invariants for the texture status poller.
 *
 * The handler reads the job row, awaits a RunPod round trip, and only then
 * settles the job. Every await between the read and the write is a window in
 * which another poll — or the cancel endpoint — can settle the same row, so the
 * credit has to hang off the `-> failed` transition rather than off the
 * pre-fetch copy. These tests assert the invariant the code MUST satisfy: a
 * failed job returns its cost to its owner exactly once, no matter how many
 * requests are in flight.
 *
 * Note on PGlite: it serialises individual queries, so a parallel test alone
 * would be a weak signal. The cancel-during-poll case below is therefore
 * deterministic — the cancel is driven from inside the mocked RunPod call, i.e.
 * exactly at the await the poller is parked on.
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

const runpod = vi.hoisted(() => ({
	getJobStatus: vi.fn(),
	cancelJob: vi.fn(async () => undefined),
}));

vi.mock('$lib/server/runpod', () => runpod);

const [status, cancel] = await Promise.all([
	import('./+server'),
	import('../cancel/+server'),
]);

const USER_ID = 'user-1';
const TEXTURE_ID = 'tex-1';
const RUNPOD_JOB_ID = 'runpod-1';
// Split across both buckets so a refund that pays only one of them is caught.
// The invariant is on the total: 2 + 1 === 3.
const TOKEN_COST = 3;
const BONUS_TOKEN_COST = 1;

type Handler = (event: {
	params: { id: string };
	locals: { user: { id: string } };
}) => Promise<Response>;

const asOwner = (handler: unknown) =>
	(handler as Handler)({
		params: { id: TEXTURE_ID },
		locals: { user: { id: USER_ID } },
	});

const poll = () => asOwner(status.GET);
const cancelRequest = () => asOwner(cancel.POST);

let ctx: TestDatabase;

async function balance() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

async function job() {
	const [row] = await ctx.db
		.select()
		.from(table.textureGeneration)
		.where(eq(table.textureGeneration.id, TEXTURE_ID));
	return row;
}

describe('GET /api/textures/[id]/status', () => {
	beforeAll(async () => {
		ctx = await createTestDatabase();
		holder.db = ctx.db;
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	beforeEach(async () => {
		vi.clearAllMocks();
		runpod.getJobStatus.mockResolvedValue({
			status: 'FAILED',
			error: 'worker exploded',
		});
		await ctx.reset();
		await ctx.db.insert(table.user).values({
			id: USER_ID,
			email: 'u@example.com',
			tokens: 0,
			bonusTokens: 0,
		});
		await ctx.db.insert(table.textureGeneration).values({
			id: TEXTURE_ID,
			userId: USER_ID,
			prompt: 'test',
			status: 'processing',
			runpodJobId: RUNPOD_JOB_ID,
			tokenCost: TOKEN_COST,
			bonusTokenCost: BONUS_TOKEN_COST,
		});
	});

	it('refunds the token cost and reports the failure', async () => {
		const response = await poll();

		expect(response.status).toBe(200);
		await expect(response.json()).resolves.toMatchObject({
			id: TEXTURE_ID,
			status: 'failed',
			error: 'worker exploded',
		});
		expect(await balance()).toBe(TOKEN_COST);
	});

	it('a second poll does not refund again', async () => {
		await poll();
		await poll();
		expect(await balance()).toBe(TOKEN_COST);
	});

	// The money invariant, and the reported reproduction: five concurrent polls
	// of a 3-token job used to leave a balance of 15.
	it('five concurrent polls refund exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 5 }, () => poll()));
		expect(await balance()).toBe(TOKEN_COST);
	});

	// Cancel pressed while the page's poll loop has a request in flight. The
	// cancel runs at the exact await the poller is parked on, so the poller
	// resumes holding a row it read as 'processing' and finds it settled.
	it('a cancel landing mid-poll refunds once in total', async () => {
		runpod.getJobStatus.mockImplementation(async () => {
			await cancelRequest();
			return { status: 'FAILED', error: 'worker exploded' };
		});

		await poll();

		expect(await balance()).toBe(TOKEN_COST);
		expect((await job()).errorMessage).toBe('Cancelled by user');
	});

	// `completed` is terminal too, not just `failed`. This row is re-checked
	// against RunPod because it carries no result URL, and RunPod says FAILED —
	// but a poller must not silently flip a settled row back and pay it out. The
	// cancel endpoint is the deliberate path for reclaiming a stuck one.
	it('does not refund a job that already settled as completed', async () => {
		await ctx.db
			.update(table.textureGeneration)
			.set({ status: 'completed' })
			.where(eq(table.textureGeneration.id, TEXTURE_ID));

		await poll();

		expect((await job()).status).toBe('completed');
		expect(await balance()).toBe(0);
	});
});
