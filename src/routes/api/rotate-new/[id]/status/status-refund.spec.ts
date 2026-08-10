/**
 * Money invariants for the 4-direction rotation status poller.
 *
 * The client polls this endpoint on a loop while a job is in flight, so several
 * GETs for one job are routinely open at the same moment, and each one holds a
 * copy of the job row that it read *before* the fal.ai round trip. Gating the
 * refund on that copy pays out once per poll; the job was charged once, so it
 * must be credited back once, however many pollers observe the failure.
 *
 * The cross-endpoint case is the user pressing Cancel while a poll is in
 * flight. `/api/rotate-new/[id]/cancel` claims the job atomically and refunds
 * it; this handler then resumes holding a row that still says 'processing'. It
 * must not pay a second time. That interleaving is forced deterministically
 * here — the cancel runs inside the awaited fal.ai call — rather than hoped for
 * from parallel dispatch, because PGlite serialises queries.
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

type FalStatus = {
	status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED' | 'CANCELLED';
	output?: Record<string, string | undefined>;
	error?: string;
};

// What the mocked fal.ai poll reports, and what it does while the handler is
// awaiting it. `during` is how the cancel-mid-poll race is made deterministic.
const fal = vi.hoisted(() => ({
	reply: { status: 'FAILED', error: 'Inference failed' } as FalStatus,
	during: null as null | (() => Promise<unknown>),
}));

vi.mock('$lib/server/fal', () => ({
	getRotationJobStatus: vi.fn(async () => {
		if (fal.during) await fal.during();
		return fal.reply;
	}),
	cancelRotationJob: vi.fn(async () => undefined),
}));

const [status, cancel] = await Promise.all([
	import('./+server'),
	import('../cancel/+server'),
]);

const USER_ID = 'user-rotnew-1';
const GUEST_ID = 'guest-rotnew-1';
const JOB_ID = 'rotnew-job-1';
const FAL_REQUEST_ID = 'fal-req-1';

// Split across both buckets so a handler that credits only one of them is
// caught too. The invariant is on the total: 4 + 3 === 7.
const TOKEN_COST = 7;
const BONUS_TOKEN_COST = 3;

interface Event {
	params: { id: string };
	locals: { user?: { id: string }; guestSession?: { id: string } };
	url: URL;
}

type Handler = (event: Event) => Promise<Response>;

function poll(locals: Event['locals'] = { user: { id: USER_ID } }) {
	return (status.GET as unknown as Handler)({
		params: { id: JOB_ID },
		locals,
		url: new URL(`http://localhost/api/rotate-new/${JOB_ID}/status`),
	});
}

function cancelAsOwner() {
	return (cancel.POST as unknown as Handler)({
		params: { id: JOB_ID },
		locals: { user: { id: USER_ID } },
		url: new URL(`http://localhost/api/rotate-new/${JOB_ID}/cancel`),
	});
}

let ctx: TestDatabase;

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
		.from(table.rotationJobNew)
		.where(eq(table.rotationJobNew.id, JOB_ID));
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
	fal.reply = { status: 'FAILED', error: 'Inference failed' };
	fal.during = null;

	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'rotnew@example.com',
		tokens: 0,
		bonusTokens: 0,
	});
	await ctx.db.insert(table.rotationJobNew).values({
		id: JOB_ID,
		userId: USER_ID,
		status: 'processing',
		falRequestId: FAL_REQUEST_ID,
		tokenCost: TOKEN_COST,
		bonusTokenCost: BONUS_TOKEN_COST,
	});
});

describe('GET /api/rotate-new/[id]/status — refund on fal.ai failure', () => {
	it('fails the job and refunds its cost once', async () => {
		const response = await poll();
		const body = (await response.json()) as Record<string, unknown>;

		expect(body.status).toBe('failed');
		expect(body.error).toBe('Inference failed');
		expect((await jobRow()).status).toBe('failed');
		expect(await balance()).toBe(TOKEN_COST);
	});

	// The money invariant. The poll loop keeps several GETs open at once and they
	// all read the row before any of them writes; the job was charged once.
	it('five concurrent polls refund exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 5 }, () => poll()));
		expect(await balance()).toBe(TOKEN_COST);
	});

	// The cross-endpoint case, forced deterministically: Cancel lands (and pays
	// the user back) while this handler is awaiting fal.ai, so the handler
	// resumes with a copy of the row that still says 'processing'.
	it('does not pay again when a cancel lands mid-poll', async () => {
		fal.during = cancelAsOwner;

		await poll();

		expect(await balance()).toBe(TOKEN_COST);
		expect((await jobRow()).status).toBe('failed');
	});

	// A completed job has delivered its result. Refunding it would hand the user
	// both the credits and the generation.
	it('does not refund a job that already completed', async () => {
		await ctx.db
			.update(table.rotationJobNew)
			.set({ status: 'completed', rotationFront: 'https://cdn.test/f.png' })
			.where(eq(table.rotationJobNew.id, JOB_ID));

		await poll();

		expect(await balance()).toBe(0);
		expect((await jobRow()).status).toBe('completed');
	});

	// A poll still in flight when the job settles must not drag it back out of a
	// terminal state: 'processing' is claimable, so that would re-arm the refund
	// for the next poll to collect a second time.
	it('does not resurrect a settled job to processing', async () => {
		// Seeded 'pending' so the handler's stale copy makes it want to write
		// 'processing'; a job already at 'processing' would skip the write and the
		// test would prove nothing.
		await ctx.db
			.update(table.rotationJobNew)
			.set({ status: 'pending' })
			.where(eq(table.rotationJobNew.id, JOB_ID));
		fal.reply = { status: 'IN_PROGRESS' };
		fal.during = cancelAsOwner;

		await poll();

		expect((await jobRow()).status).toBe('failed');
		expect(await balance()).toBe(TOKEN_COST);
	});

	// The compound vector the guard above closes: the in-flight poll re-arms the
	// row as non-terminal, and the NEXT poll's claim then refunds a job the
	// cancel has already paid for.
	it('does not double refund via a stale processing write', async () => {
		await ctx.db
			.update(table.rotationJobNew)
			.set({ status: 'pending' })
			.where(eq(table.rotationJobNew.id, JOB_ID));
		fal.reply = { status: 'IN_QUEUE' };
		fal.during = cancelAsOwner;
		await poll();
		expect(await balance()).toBe(TOKEN_COST);

		fal.during = null;
		fal.reply = { status: 'FAILED', error: 'Inference failed' };
		await poll();

		expect(await balance()).toBe(TOKEN_COST);
	});

	// A cancelled-and-refunded job must not be handed the asset afterwards.
	it('does not deliver results over a failed job', async () => {
		fal.reply = {
			status: 'COMPLETED',
			output: {
				front: 'https://cdn.test/f.png',
				back: 'https://cdn.test/b.png',
			},
		};
		fal.during = cancelAsOwner;

		await poll();

		const row = await jobRow();
		expect(row.status).toBe('failed');
		expect(row.rotationFront).toBeNull();
		expect(await balance()).toBe(TOKEN_COST);
	});

	// `needsFalCheck` re-polls a row that is 'completed' with no images, so the
	// completion write is guarded on `rotation_front IS NULL` rather than on the
	// row being non-terminal — excluding 'completed' outright would disable this
	// repair. It must still not fire twice over a delivered asset.
	it('backfills a completed row that never received its images', async () => {
		await ctx.db
			.update(table.rotationJobNew)
			.set({ status: 'completed' })
			.where(eq(table.rotationJobNew.id, JOB_ID));
		fal.reply = {
			status: 'COMPLETED',
			output: { front: 'https://cdn.test/f.png' },
		};

		await poll();

		expect((await jobRow()).rotationFront).toBe('https://cdn.test/f.png');
		expect(await balance()).toBe(0);
	});
});

describe('GET /api/rotate-new/[id]/status — guest-owned job', () => {
	beforeEach(async () => {
		await ctx.db
			.delete(table.rotationJobNew)
			.where(eq(table.rotationJobNew.id, JOB_ID));
		await ctx.db.insert(table.guestSession).values({
			id: GUEST_ID,
			ipAddress: '127.0.0.1',
			expiresAt: new Date(Date.now() + 86_400_000),
		});
		await ctx.db.insert(table.rotationJobNew).values({
			id: JOB_ID,
			guestSessionId: GUEST_ID,
			status: 'processing',
			falRequestId: FAL_REQUEST_ID,
			tokenCost: 0,
			bonusTokenCost: 0,
		});
	});

	// Guest jobs hold no balance — the row's user_id is NULL, so there is nobody
	// to credit. The job must still be marked failed.
	it('fails the job without crediting anyone', async () => {
		const response = await poll({ guestSession: { id: GUEST_ID } });
		const body = (await response.json()) as Record<string, unknown>;

		expect(body.status).toBe('failed');
		expect((await jobRow()).status).toBe('failed');
		expect(await balance()).toBe(0);
	});
});
