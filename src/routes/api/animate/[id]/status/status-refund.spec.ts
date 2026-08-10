/**
 * Refund invariants for the animation status poller.
 *
 * The handler reads the job row, then awaits: one fal.ai status round trip per
 * in-flight direction, and — once every direction has a video — a frame-archive
 * build that runs ffmpeg locally for up to five minutes. Everything it learned
 * before those awaits is stale by the time it acts. Meanwhile the page polls on
 * a loop with several GETs in flight, `/api/animate/[id]/cancel` claims the same
 * row atomically, and the fal webhook writes it too.
 *
 * The assertions below are on the invariant — a job returns its cost to the user
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
import { DIRECTIONS_4 } from '$lib/animation-config';

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
	env: { BLOB_READ_WRITE_TOKEN: 'test-blob-token' },
}));

interface FalStatus {
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: { videoUrl: string };
	error?: string;
}

/** What the next getAnimateJobStatus call resolves to, and when. */
const fal = vi.hoisted(() => ({
	next: { status: 'FAILED', error: 'fal said no' } as FalStatus,
	/** Set to a promise to hold every in-flight status call open. */
	gate: null as Promise<void> | null,
}));

vi.mock('$lib/server/fal', () => ({
	getAnimateJobStatus: vi.fn(async () => {
		if (fal.gate) await fal.gate;
		return fal.next;
	}),
	// The cancel endpoint's fal calls, for the cross-endpoint races below. fal
	// rejects a cancel once the request is running, and the endpoint swallows it.
	cancelAnimateJob: vi.fn(async () => {
		throw new Error('Request is already in progress and cannot be cancelled');
	}),
	cancelVideoBackgroundRemovalJob: vi.fn(async () => undefined),
}));

/** Stands in for the ffmpeg pipeline: minutes of local work, mocked to a tick. */
const archive = vi.hoisted(() => ({
	shouldThrow: true,
	/** Set to a promise to hold the build open, as a long export would. */
	gate: null as Promise<void> | null,
}));

vi.mock('$lib/server/spritesheet', () => ({
	buildFrameArchive: vi.fn(async () => {
		if (archive.gate) await archive.gate;
		if (archive.shouldThrow) throw new Error('ffmpeg exploded');
		return {
			buffer: Buffer.from('zip'),
			frameCount: 8,
			tileWidth: 64,
			tileHeight: 64,
		};
	}),
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async () => ({ url: 'https://blob.test/frames.zip' })),
}));

const { GET } = await import('./+server');
const { POST: cancelPOST } = await import('../cancel/+server');

const USER_ID = 'user-1';
const JOB_ID = 'anim-1';

// `tokenCost` is the whole price and `bonusTokenCost` is the part of it that was
// paid out of the bonus bucket, so a full refund puts 4 back in `tokens` and 3
// back in `bonusTokens` — 7 in total. Splitting it this way catches a handler
// that credits only one of the two buckets.
const TOKEN_COST = 7;
const BONUS_TOKEN_COST = 3;
const REFUND_TOTAL = TOKEN_COST;

const FAL_REQUEST_IDS = Object.fromEntries(
	DIRECTIONS_4.map((d) => [d, `fal-req-${d}`]),
);
const ALL_VIDEOS = Object.fromEntries(
	DIRECTIONS_4.map((d) => [d, `https://fal.test/${d}.mp4`]),
);

interface Event {
	params: { id: string };
	locals: { user?: { id: string } };
	url: URL;
}

const poll = () =>
	(GET as unknown as (event: Event) => Promise<Response>)({
		params: { id: JOB_ID },
		locals: { user: { id: USER_ID } },
		url: new URL(`http://localhost/api/animate/${JOB_ID}/status`),
	});

const cancel = () =>
	(cancelPOST as unknown as (event: Event) => Promise<Response>)({
		params: { id: JOB_ID },
		locals: { user: { id: USER_ID } },
		url: new URL(`http://localhost/api/animate/${JOB_ID}/cancel`),
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

async function jobRow() {
	const [row] = await ctx.db
		.select()
		.from(table.animationJob)
		.where(eq(table.animationJob.id, JOB_ID));
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

async function seedJob(
	overrides: Partial<typeof table.animationJob.$inferInsert> = {},
) {
	await ctx.db.insert(table.animationJob).values({
		id: JOB_ID,
		userId: USER_ID,
		status: 'processing',
		animationType: 'walk',
		elevation: 'side',
		directionCount: 4,
		falRequestIds: FAL_REQUEST_IDS,
		tokenCost: TOKEN_COST,
		bonusTokenCost: BONUS_TOKEN_COST,
		...overrides,
	});
}

/** A job whose directions are all in, so the next poll runs the frame export. */
const seedReadyToExport = () => seedJob({ directionVideos: ALL_VIDEOS });

describe('GET /api/animate/[id]/status — direction failure', () => {
	beforeEach(async () => {
		await ctx.reset();
		fal.next = { status: 'FAILED', error: 'fal said no' };
		fal.gate = null;
		archive.shouldThrow = true;
		archive.gate = null;
		await seedUser();
	});

	it('refunds a failed direction exactly once', async () => {
		await seedJob();

		const response = await poll();

		expect(response.status).toBe(200);
		expect(await balance()).toBe(REFUND_TOTAL);
		expect((await jobRow()).status).toBe('failed');
	});

	// The money invariant, and the reported defect: the page keeps polling while
	// the request that will observe the failure is in flight, so five GETs land on
	// one failed job and the pre-await status read lets all five pay out. A
	// 3-token job was measured leaving a balance of 15.
	it('five concurrent polls of a failed job refund exactly once', async () => {
		await seedJob();

		await Promise.allSettled(Array.from({ length: 5 }, () => poll()));

		expect(await balance()).toBe(REFUND_TOTAL);
	});

	// Pressing Cancel with a poll already in flight. The cancel claims the row and
	// pays; the poll must find nothing left to claim rather than paying again off
	// the copy it read before its fal.ai round trip.
	it('does not refund on top of a cancel that lands mid-poll', async () => {
		await seedJob();

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
		await seedJob({ status: 'pending' });

		let release: () => void = () => {};
		fal.gate = new Promise<void>((resolve) => {
			release = resolve;
		});
		fal.next = { status: 'IN_QUEUE' };

		const polling = poll();
		await cancel();
		release();
		await polling;

		expect((await jobRow()).status).toBe('failed');

		fal.gate = null;
		fal.next = { status: 'FAILED', error: 'fal said no' };
		await poll();

		expect(await balance()).toBe(REFUND_TOTAL);
	});
});

describe('GET /api/animate/[id]/status — frame archive', () => {
	beforeEach(async () => {
		await ctx.reset();
		fal.next = { status: 'COMPLETED', output: { videoUrl: 'unused' } };
		fal.gate = null;
		archive.shouldThrow = true;
		archive.gate = null;
		await seedUser();
	});

	it('refunds a failed frame archive exactly once', async () => {
		await seedReadyToExport();

		await poll();

		expect(await balance()).toBe(REFUND_TOTAL);
		expect((await jobRow()).status).toBe('failed');
	});

	// This catch had no status check at all — not even a stale one — so it paid
	// out unconditionally every time it was entered. Nothing stops two polls from
	// both entering the export, and when the build is broken both of them throw.
	it('two polls that both fail the export refund exactly once', async () => {
		await seedReadyToExport();

		await Promise.allSettled([poll(), poll()]);

		expect(await balance()).toBe(REFUND_TOTAL);
	});

	// The export runs for minutes; Cancel lands in the middle of it and pays. The
	// archive failure that follows must not pay again.
	it('does not refund a failed export on top of a cancel', async () => {
		await seedReadyToExport();

		let release: () => void = () => {};
		archive.gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const polling = poll();
		await cancel();
		release();
		await polling;

		expect(await balance()).toBe(REFUND_TOTAL);
	});

	// The mirror image, and the reason 'completed' is terminal too: an export that
	// succeeds after the user was refunded must not hand over the asset anyway.
	it('does not deliver an export for a job that was cancelled and refunded', async () => {
		await seedReadyToExport();
		archive.shouldThrow = false;

		let release: () => void = () => {};
		archive.gate = new Promise<void>((resolve) => {
			release = resolve;
		});

		const polling = poll();
		await cancel();
		release();
		await polling;

		const row = await jobRow();
		expect.soft(row.status).toBe('failed');
		expect.soft(row.spritesheetUrl).toBeNull();
		expect.soft(await balance()).toBe(REFUND_TOTAL);
	});

	// A clean export on an uncontested job still has to work: the guards must not
	// cost the happy path its completion.
	it('completes an uncontested export and refunds nothing', async () => {
		await seedReadyToExport();
		archive.shouldThrow = false;

		await poll();

		const row = await jobRow();
		expect.soft(row.status).toBe('completed');
		expect.soft(row.spritesheetUrl).toBe('https://blob.test/frames.zip');
		expect.soft(await balance()).toBe(0);
	});
});
