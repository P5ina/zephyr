/**
 * Refund invariants for the concept-art status poller.
 *
 * The poller reads the generation row at the top of the request, awaits a
 * fal.ai round trip, and then decides whether to refund. Every request the
 * page's poll loop has in flight therefore holds the same pre-failure copy of
 * the row, and so does a `Cancel` press that lands in the same window. The
 * money invariant is that a job charged once is paid back once, whoever
 * notices the failure first.
 *
 * PGlite serialises individual queries, but the defect under test is an
 * application-level read-check-write spread across `await` points: every
 * handler's read is enqueued before the first write lands, so N invocations
 * still interleave on the event loop exactly as N HTTP requests would.
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

vi.mock('$env/dynamic/private', () => ({ env: {} }));

interface FalStatus {
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: { imageUrl: string; seed?: number };
	error?: string;
}

/** What fal.ai reports for the generation this test is polling. */
const fal = vi.hoisted(() => ({
	generation: {
		status: 'FAILED',
		error: 'Job failed on fal.ai',
	} as FalStatus,
}));

vi.mock('$lib/server/fal', () => ({
	getConceptArtJobStatus: vi.fn(async () => fal.generation),
	getRestyleJobStatus: vi.fn(async () => fal.generation),
	getPreprocessorJobStatus: vi.fn(async () => fal.generation),
	submitRestyleGeneration: vi.fn(async () => ({ requestId: 'req-2' })),
	// fal.queue.cancel throws once a request is RUNNING; the cancel endpoint
	// swallows that and refunds anyway, which is what makes the race reachable.
	cancelConceptArtJob: vi.fn(async () => {
		throw new Error('Request is already in progress and cannot be cancelled');
	}),
	cancelRestyleJob: vi.fn(async () => {
		throw new Error('Request is already in progress and cannot be cancelled');
	}),
}));

const { GET: statusGET } = await import('./+server');
const { POST: cancelPOST } = await import('../cancel/+server');

const USER_ID = 'user-1';
const JOB_ID = 'concept-1';
// Split across both buckets so a handler that credits only one of them is
// caught too. The invariant is on the total: 2 + 1 === 3.
const TOKEN_COST = 3;
const BONUS_TOKEN_COST = 1;

type Handler = (event: {
	params: { id: string };
	locals: { user: { id: string } };
}) => Promise<Response>;

const poll = () =>
	(statusGET as unknown as Handler)({
		params: { id: JOB_ID },
		locals: { user: { id: USER_ID } },
	});

const cancel = () =>
	(cancelPOST as unknown as Handler)({
		params: { id: JOB_ID },
		locals: { user: { id: USER_ID } },
	});

let ctx: TestDatabase;

async function balance() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

async function generation() {
	const [row] = await ctx.db
		.select()
		.from(table.conceptArtGeneration)
		.where(eq(table.conceptArtGeneration.id, JOB_ID));
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
	fal.generation = { status: 'FAILED', error: 'Job failed on fal.ai' };
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'u@example.com',
		tokens: 0,
		bonusTokens: 0,
	});
	await ctx.db.insert(table.conceptArtGeneration).values({
		id: JOB_ID,
		userId: USER_ID,
		prompt: 'a lighthouse',
		status: 'processing',
		falRequestId: 'req-1',
		tokenCost: TOKEN_COST,
		bonusTokenCost: BONUS_TOKEN_COST,
	});
});

describe('GET /api/concept-art/[id]/status', () => {
	it('refunds a fal.ai failure exactly once', async () => {
		await poll();

		expect(await balance()).toBe(TOKEN_COST);
		expect((await generation()).status).toBe('failed');
	});

	// The money invariant. The poll loop keeps several requests in flight; all of
	// them see the same pre-failure row, and only the one that wins the
	// `-> failed` transition may credit anything.
	it('five concurrent polls refund exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 5 }, poll));

		expect(await balance()).toBe(TOKEN_COST);
	});

	// Cancel and the poll loop race each other constantly: the user presses
	// Cancel while a poll is mid-round-trip. Exactly one of them pays.
	it('does not refund on top of a concurrent cancel', async () => {
		await Promise.allSettled([cancel(), poll()]);

		expect(await balance()).toBe(TOKEN_COST);
	});

	// Refund XOR asset, never both: a job that fal.ai finished after the user
	// cancelled must either be delivered or be paid back, not delivered *and*
	// paid back.
	it('never delivers the image and the refund for the same job', async () => {
		fal.generation = {
			status: 'COMPLETED',
			output: { imageUrl: 'https://fal.media/files/late.png' },
		};

		await Promise.allSettled([cancel(), poll()]);

		const refunded = (await balance()) === TOKEN_COST;
		const delivered = (await generation()).imageUrl !== null;
		expect(refunded).not.toBe(delivered);
	});

	it('reports a failed generation over the same JSON contract', async () => {
		const response = await poll();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: JOB_ID,
			status: 'failed',
			error: 'Job failed on fal.ai',
		});
	});

	it('reports an in-flight generation over the same JSON contract', async () => {
		fal.generation = { status: 'IN_PROGRESS' };

		const response = await poll();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: JOB_ID,
			status: 'processing',
			progress: 0,
			statusMessage: 'Processing...',
		});
		expect(await balance()).toBe(0);
	});
});
