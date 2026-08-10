/**
 * Refund invariants for the six cancel endpoints that were not covered by
 * src/routes/api/textures/[id]/cancel/cancel.spec.ts.
 *
 * All seven handlers share one shape: read the job, check its status, call the
 * external cancel, then credit the user. The check and the credit are separated
 * by `await` points and nothing in the credit is conditional on the row still
 * being in the state that was read. These tests assert the invariant the code
 * MUST satisfy — a cancelled job returns its cost to the user exactly once, no
 * matter how many requests arrive — rather than the behaviour it has today.
 *
 * Note on PGlite: it serialises individual queries, but the defect is an
 * application-level read-check-write spread across `await` points, so N handler
 * invocations still interleave on the event loop: every read is enqueued before
 * the first write lands, and every handler sees the pre-cancel row.
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
	type TestDb,
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

// Every cancel* the six handlers reach for. Mocked as a unit so no fal.ai
// client is constructed and no network call is attempted.
vi.mock('$lib/server/fal', () => ({
	cancelSpriteJob: vi.fn(async () => undefined),
	cancelRotationJob: vi.fn(async () => undefined),
	cancelRotation8DirJob: vi.fn(async () => undefined),
	cancelSpinJob: vi.fn(async () => undefined),
	cancelConceptArtJob: vi.fn(async () => undefined),
	cancelRestyleJob: vi.fn(async () => undefined),
	cancelAnimateJob: vi.fn(async () => undefined),
	cancelVideoBackgroundRemovalJob: vi.fn(async () => undefined),
}));

vi.mock('$env/dynamic/private', () => ({ env: {} }));

const [assets, conceptArt, rotate, rotateNew, spin, animate] =
	await Promise.all([
		import('./assets/[id]/cancel/+server'),
		import('./concept-art/[id]/cancel/+server'),
		import('./rotate/[id]/cancel/+server'),
		import('./rotate-new/[id]/cancel/+server'),
		import('./spin/[id]/cancel/+server'),
		import('./animate/[id]/cancel/+server'),
	]);

const USER_ID = 'user-1';
const JOB_ID = 'job-1';

// Split across both buckets so a handler that refunds only one of them is
// caught too. The invariant under test is on the total: 4 + 3 === 7.
const TOKEN_COST = 7;
const BONUS_TOKEN_COST = 3;

interface CancelEvent {
	params: { id: string };
	locals: { user?: { id: string }; guestSession?: { id: string } };
	url: URL;
}

type CancelHandler = (event: CancelEvent) => Promise<Response>;

interface CancelCase {
	name: string;
	/** The route's POST, cast out of SvelteKit's full RequestEvent. */
	post: CancelHandler;
	/**
	 * Seeds the single in-flight job the handler will read. A closure rather
	 * than a { table, row } pair so each row keeps its own insert types and a
	 * missing NOT NULL column is a compile error, not a runtime surprise.
	 */
	seedRow: (db: TestDb) => Promise<unknown>;
}

const CASES: CancelCase[] = [
	{
		name: 'POST /api/assets/[id]/cancel',
		post: assets.POST as unknown as CancelHandler,
		seedRow: (db) =>
			db.insert(table.assetGeneration).values({
				id: JOB_ID,
				visibleId: 'visible-1',
				userId: USER_ID,
				assetType: 'sprite',
				prompt: 'test',
				status: 'processing',
				tokenCost: TOKEN_COST,
				bonusTokenCost: BONUS_TOKEN_COST,
			}),
	},
	{
		name: 'POST /api/concept-art/[id]/cancel',
		post: conceptArt.POST as unknown as CancelHandler,
		seedRow: (db) =>
			db.insert(table.conceptArtGeneration).values({
				id: JOB_ID,
				userId: USER_ID,
				prompt: 'test',
				status: 'processing',
				tokenCost: TOKEN_COST,
				bonusTokenCost: BONUS_TOKEN_COST,
			}),
	},
	{
		name: 'POST /api/rotate/[id]/cancel',
		post: rotate.POST as unknown as CancelHandler,
		seedRow: (db) =>
			db.insert(table.rotationJob).values({
				id: JOB_ID,
				userId: USER_ID,
				status: 'processing',
				tokenCost: TOKEN_COST,
				bonusTokenCost: BONUS_TOKEN_COST,
			}),
	},
	{
		name: 'POST /api/rotate-new/[id]/cancel',
		post: rotateNew.POST as unknown as CancelHandler,
		seedRow: (db) =>
			db.insert(table.rotationJobNew).values({
				id: JOB_ID,
				userId: USER_ID,
				status: 'processing',
				tokenCost: TOKEN_COST,
				bonusTokenCost: BONUS_TOKEN_COST,
			}),
	},
	{
		name: 'POST /api/spin/[id]/cancel',
		post: spin.POST as unknown as CancelHandler,
		seedRow: (db) =>
			db.insert(table.spinJob).values({
				id: JOB_ID,
				userId: USER_ID,
				status: 'processing',
				tokenCost: TOKEN_COST,
				bonusTokenCost: BONUS_TOKEN_COST,
			}),
	},
	{
		name: 'POST /api/animate/[id]/cancel',
		post: animate.POST as unknown as CancelHandler,
		seedRow: (db) =>
			db.insert(table.animationJob).values({
				id: JOB_ID,
				userId: USER_ID,
				status: 'processing',
				animationType: 'walk',
				elevation: 'side',
				tokenCost: TOKEN_COST,
				bonusTokenCost: BONUS_TOKEN_COST,
			}),
	},
];

function cancelAsOwner(post: CancelHandler) {
	return post({
		params: { id: JOB_ID },
		locals: { user: { id: USER_ID } },
		url: new URL(`http://localhost/api/cancel/${JOB_ID}`),
	});
}

async function balance(db: TestDb) {
	const [row] = await db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

let ctx: TestDatabase;

beforeAll(async () => {
	ctx = await createTestDatabase();
	holder.db = ctx.db;
}, 120_000);

afterAll(async () => {
	await ctx?.close();
});

async function seedUser() {
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'u@example.com',
		tokens: 0,
		bonusTokens: 0,
	});
}

describe.each(CASES)('$name', (testCase) => {
	beforeEach(async () => {
		await ctx.reset();
		await seedUser();
		await testCase.seedRow(ctx.db);
	});

	it('refunds the token cost exactly once', async () => {
		await cancelAsOwner(testCase.post);
		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});

	// The money invariant. Twenty requests that arrive together must still
	// produce exactly one refund — the state transition, not a prior read, has
	// to be what gates the credit.
	it('twenty concurrent cancels refund exactly once', async () => {
		await Promise.allSettled(
			Array.from({ length: 20 }, () => cancelAsOwner(testCase.post)),
		);
		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});
});

// spin's ownership filter is built as and(eq(id), or(userCond, guestCond)).
// With neither locals.user nor locals.guestSession, both arms of or() are
// undefined; drizzle's or() drops undefined arms and returns undefined when
// none are left, so and() collapses to the bare id match and the handler
// authorises nobody as everybody.
describe('POST /api/spin/[id]/cancel — ownership', () => {
	beforeEach(async () => {
		await ctx.reset();
		await seedUser();
		await ctx.db.insert(table.spinJob).values({
			id: JOB_ID,
			userId: USER_ID,
			status: 'processing',
			tokenCost: TOKEN_COST,
			bonusTokenCost: BONUS_TOKEN_COST,
		});
	});

	it('rejects an unauthenticated caller instead of cancelling any spin job', async () => {
		const outcome = await Promise.allSettled([
			(spin.POST as unknown as CancelHandler)({
				params: { id: JOB_ID },
				locals: {},
				url: new URL(`http://localhost/api/spin/${JOB_ID}/cancel`),
			}),
		]);

		const [job] = await ctx.db
			.select({ status: table.spinJob.status })
			.from(table.spinJob)
			.where(eq(table.spinJob.id, JOB_ID));

		// The job belongs to USER_ID and the caller proved nothing. Soft so all
		// three consequences are reported, not just the first: the job must be
		// untouched, the owner's balance must be untouched, and the request must
		// have been refused.
		expect.soft(job.status).toBe('processing');
		expect.soft(await balance(ctx.db)).toBe(0);
		expect.soft(outcome[0].status).toBe('rejected');
	});
});
