/**
 * Refund invariants for the sprite status poller.
 *
 * The handler reads the asset row, awaits a fal.ai round trip, and only then
 * decides what to write. Everything it learned before that await is stale by
 * the time it acts: the page polls on a loop, several polls are in flight at
 * once, and the cancel endpoint and the fal webhook write the same row. The
 * assertions below are on the invariant — a job returns its cost to the user
 * exactly once, however many requests observe its failure — not on the shape of
 * the code that satisfies it.
 *
 * PGlite serialises queries, so these are not true simultaneous races. They do
 * not need to be: the defect is an application-level read-check-write spread
 * across awaits, so N handler invocations still interleave on the event loop —
 * every read is enqueued before the first write lands, and every handler sees
 * the pre-failure row. A refund gated on that read pays out N times even when
 * the statements themselves run one after another.
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
	output?: { rawUrl?: string; processedUrl?: string; seed?: number };
	error?: string;
}

/** What the next getSpriteJobStatus call resolves to, and when. */
const fal = vi.hoisted(() => ({
	next: { status: 'FAILED', error: 'fal said no' } as FalStatus,
	/** Set to a promise to hold every in-flight status call open. */
	gate: null as Promise<void> | null,
}));

vi.mock('$lib/server/fal', () => ({
	getSpriteJobStatus: vi.fn(async () => {
		if (fal.gate) await fal.gate;
		return fal.next;
	}),
	// The cancel endpoint's fal call, for the cross-endpoint race below. fal
	// rejects a cancel once the request is running, and the endpoint swallows it.
	cancelSpriteJob: vi.fn(async () => {
		throw new Error('Request is already in progress and cannot be cancelled');
	}),
}));

const { GET } = await import('./+server');
const { POST: cancelPOST } = await import('../cancel/+server');

const USER_ID = 'user-1';
const ASSET_ID = 'asset-1';
const GUEST_ID = 'guest-1';

// `tokenCost` is the whole price and `bonusTokenCost` is the part of it that
// was paid out of the bonus bucket, so a full refund puts 4 back in `tokens`
// and 3 back in `bonusTokens` — 7 in total. Splitting it this way catches a
// handler that credits only one of the two buckets.
const TOKEN_COST = 7;
const BONUS_TOKEN_COST = 3;
const REFUND_TOTAL = TOKEN_COST;

interface Event {
	params: { id: string };
	locals: { user?: { id: string }; guestSession?: { id: string } };
	url: URL;
}

const poll = (locals: Event['locals'] = { user: { id: USER_ID } }) =>
	(GET as unknown as (event: Event) => Promise<Response>)({
		params: { id: ASSET_ID },
		locals,
		url: new URL(`http://localhost/api/assets/${ASSET_ID}/status`),
	});

const cancel = () =>
	(cancelPOST as unknown as (event: Event) => Promise<Response>)({
		params: { id: ASSET_ID },
		locals: { user: { id: USER_ID } },
		url: new URL(`http://localhost/api/assets/${ASSET_ID}/cancel`),
	});

let ctx: TestDatabase;

beforeAll(async () => {
	ctx = await createTestDatabase();
	holder.db = ctx.db;
}, 120_000);

afterAll(async () => {
	await ctx?.close();
});

async function balance() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

async function assetRow() {
	const [row] = await ctx.db
		.select()
		.from(table.assetGeneration)
		.where(eq(table.assetGeneration.id, ASSET_ID));
	return row;
}

async function seedUser() {
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'u@example.com',
		tokens: 0,
		bonusTokens: 0,
	});
}

async function seedAsset(
	overrides: Partial<typeof table.assetGeneration.$inferInsert> = {},
) {
	await ctx.db.insert(table.assetGeneration).values({
		id: ASSET_ID,
		visibleId: 'visible-1',
		userId: USER_ID,
		assetType: 'sprite',
		prompt: 'test',
		status: 'processing',
		runpodJobId: 'fal-request-1',
		tokenCost: TOKEN_COST,
		bonusTokenCost: BONUS_TOKEN_COST,
		...overrides,
	});
}

describe('GET /api/assets/[id]/status', () => {
	beforeEach(async () => {
		await ctx.reset();
		fal.next = { status: 'FAILED', error: 'fal said no' };
		fal.gate = null;
		await seedUser();
	});

	it('refunds a failed job exactly once', async () => {
		await seedAsset();

		const response = await poll();

		expect(response.status).toBe(200);
		expect(await balance()).toBe(REFUND_TOTAL);
		expect((await assetRow()).status).toBe('failed');
	});

	// The money invariant, and the reported defect: the page keeps polling while
	// the request that will observe the failure is in flight, so five GETs land
	// on one failed job and the pre-await status read lets all five pay out.
	it('five concurrent polls of a failed job refund exactly once', async () => {
		await seedAsset();

		await Promise.allSettled(Array.from({ length: 5 }, () => poll()));

		expect(await balance()).toBe(REFUND_TOTAL);
	});

	// Pressing Cancel with a poll already in flight. The cancel claims the row
	// and pays; the poll must find nothing left to claim rather than paying again
	// off the copy it read before its fal round trip.
	it('does not refund on top of a cancel that lands mid-poll', async () => {
		await seedAsset();

		let release: () => void = () => {};
		fal.gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const polling = poll();
		await cancel();
		release();
		await polling;

		expect(await balance()).toBe(REFUND_TOTAL);
	});

	// The other half of that race: the poll's own 'processing' write must not
	// resurrect the cancelled row. If it does, the row is claimable again and the
	// next poll — which will see FAILED, because the job really was cancelled —
	// pays a second time.
	it('does not resurrect a cancelled job and re-arm its refund', async () => {
		await seedAsset({ status: 'pending' });

		let release: () => void = () => {};
		fal.gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		fal.next = { status: 'IN_QUEUE' };

		const polling = poll();
		await cancel();
		release();
		await polling;

		expect((await assetRow()).status).toBe('failed');

		fal.gate = null;
		fal.next = { status: 'FAILED', error: 'fal said no' };
		await poll();

		expect(await balance()).toBe(REFUND_TOTAL);
	});

	// Refund XOR asset, never both. fal only accepts a cancel while the request
	// is still queued, so a cancelled job routinely finishes anyway and the next
	// poll sees COMPLETED. That result must not be handed over on top of the
	// refund the cancel already paid.
	it('does not deliver a result for a job it already refunded', async () => {
		await seedAsset();

		let release: () => void = () => {};
		fal.gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		fal.next = {
			status: 'COMPLETED',
			output: { processedUrl: 'https://cdn.test/sprite.png' },
		};

		const polling = poll();
		await cancel();
		release();
		await polling;

		const row = await assetRow();
		expect.soft(await balance()).toBe(REFUND_TOTAL);
		expect.soft(row.status).toBe('failed');
		expect.soft(row.resultUrls?.processed).toBeUndefined();
	});

	// 'completed' is terminal too. A row that already delivered its result must
	// not be refunded — or flipped to failed — by a late failure report.
	it('does not refund a completed job that already delivered a result', async () => {
		await seedAsset({
			status: 'completed',
			resultUrls: { processed: 'https://cdn.test/sprite.png' },
		});

		await poll();

		expect(await balance()).toBe(0);
		expect((await assetRow()).status).toBe('completed');
	});

	// A guest job holds no balance. It still has to reach 'failed', and it must
	// not credit the row's cost to anybody.
	it('fails a guest job without crediting anyone', async () => {
		await ctx.db.insert(table.guestSession).values({
			id: GUEST_ID,
			ipAddress: '203.0.113.1',
			expiresAt: new Date(Date.now() + 86_400_000),
		});
		await seedAsset({ userId: null, guestSessionId: GUEST_ID });

		await poll({ guestSession: { id: GUEST_ID } });

		expect((await assetRow()).status).toBe('failed');
		expect(await balance()).toBe(0);
	});
});
