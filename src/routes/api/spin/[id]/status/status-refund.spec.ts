/**
 * Refund invariants for the spin status poller.
 *
 * This handler is not a cancel endpoint, but it moves the same money: it reads
 * the job row, awaits a fal.ai round trip (and, on the completion path, tens of
 * seconds of local ffmpeg), and then credits the user. Two sites did that —
 * the fal FAILED/CANCELLED branch, gated on the pre-fetch copy's `status`, and
 * the video-creation catch, gated on nothing at all.
 *
 * The client polls this route on a loop, so N in-flight GETs is the normal
 * case, not an edge case. Both sites therefore have to be idempotent, and the
 * refund has to be a property of the `-> failed` transition rather than of a
 * status read taken before the await.
 *
 * On PGlite: it serialises individual queries, but the defect is an
 * application-level read-check-write spread across await points, so N handler
 * invocations still interleave on the event loop — every read lands before the
 * first write. Where a specific interleaving is what matters (a cancel landing
 * while this handler is mid-flight), the test forces it from inside the mock
 * rather than hoping for it.
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

vi.mock('$lib/server/fal', () => ({
	getSpinJobStatus: vi.fn(),
}));

vi.mock('$lib/server/video', () => ({
	createSpinVideo: vi.fn(),
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async () => ({ url: 'https://blob.example/video.mp4' })),
}));

vi.mock('$env/dynamic/private', () => ({
	env: { BLOB_READ_WRITE_TOKEN: 'test-token' },
}));

const { getSpinJobStatus } = await import('$lib/server/fal');
const { createSpinVideo } = await import('$lib/server/video');
const { claimJobAndRefund, NOT_TERMINAL } = await import('$lib/server/credits');
const { GET } = await import('./+server');

const falStatusMock = vi.mocked(getSpinJobStatus);
const createSpinVideoMock = vi.mocked(createSpinVideo);

const USER_ID = 'user-1';
const JOB_ID = 'job-1';

// Split across both buckets so a refund that credits only one of them is caught
// too. The invariant is on the total: 4 + 3 === 7.
const TOKEN_COST = 7;
const BONUS_TOKEN_COST = 3;

interface StatusEvent {
	params: { id: string };
	locals: { user?: { id: string }; guestSession?: { id: string } };
}

type StatusHandler = (event: StatusEvent) => Promise<Response>;
const get = GET as unknown as StatusHandler;

function pollAsOwner() {
	return get({ params: { id: JOB_ID }, locals: { user: { id: USER_ID } } });
}

async function balance(db: TestDb) {
	const [row] = await db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

async function jobRow(db: TestDb) {
	const [row] = await db
		.select({
			status: table.spinJob.status,
			videoUrl: table.spinJob.videoUrl,
			errorMessage: table.spinJob.errorMessage,
		})
		.from(table.spinJob)
		.where(eq(table.spinJob.id, JOB_ID));
	return row;
}

/**
 * What the cancel endpoint and the fal webhook do: claim the `-> failed`
 * transition and credit the cost back, in one statement.
 */
async function cancelElsewhere() {
	await claimJobAndRefund({
		job: table.spinJob,
		jobId: JOB_ID,
		errorMessage: 'Cancelled by user',
		claimableWhen: NOT_TERMINAL,
	});
}

let ctx: TestDatabase;

beforeAll(async () => {
	ctx = await createTestDatabase();
	holder.db = ctx.db;
}, 120_000);

afterAll(async () => {
	await ctx?.close();
});

beforeEach(async () => {
	vi.clearAllMocks();
	await ctx.reset();
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'u@example.com',
		tokens: 0,
		bonusTokens: 0,
	});
	await ctx.db.insert(table.spinJob).values({
		id: JOB_ID,
		userId: USER_ID,
		status: 'processing',
		falRequestId: 'fal-request-1',
		inputImageUrl: 'https://example.com/input.png',
		tokenCost: TOKEN_COST,
		bonusTokenCost: BONUS_TOKEN_COST,
	});
});

describe('GET /api/spin/[id]/status — fal.ai reports FAILED', () => {
	beforeEach(() => {
		falStatusMock.mockResolvedValue({
			status: 'FAILED',
			error: 'Job failed on fal.ai',
		});
	});

	it('refunds the token cost and marks the job failed', async () => {
		const response = await pollAsOwner();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: JOB_ID,
			status: 'failed',
			error: 'Job failed on fal.ai',
		});
		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});

	// The money invariant, and the proven defect: the page's poll loop keeps
	// several GETs in flight, every one of them read the row before the first
	// write landed, and every one of them paid out.
	it('five concurrent polls refund exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 5 }, pollAsOwner));

		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});

	it('does not refund again when a cancel lands mid-flight', async () => {
		// The user presses Cancel while this poll is awaiting fal.ai. The cancel
		// wins the transition and is paid; this handler is holding a copy that
		// still says 'processing'.
		falStatusMock.mockImplementation(async () => {
			await cancelElsewhere();
			return { status: 'FAILED', error: 'Job failed on fal.ai' };
		});

		await pollAsOwner();

		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});
});

describe('GET /api/spin/[id]/status — video creation fails', () => {
	beforeEach(() => {
		falStatusMock.mockResolvedValue({
			status: 'COMPLETED',
			output: { frames: ['https://example.com/frame-1.png'] },
		});
		createSpinVideoMock.mockRejectedValue(new Error('ffmpeg exploded'));
	});

	it('refunds the token cost and marks the job failed', async () => {
		const response = await pollAsOwner();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: JOB_ID,
			status: 'failed',
			error: 'Failed to create video',
		});
		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});

	it('five concurrent polls refund exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 5 }, pollAsOwner));

		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});

	it('does not refund again when a cancel lands during video creation', async () => {
		createSpinVideoMock.mockImplementation(async () => {
			await cancelElsewhere();
			throw new Error('ffmpeg exploded');
		});

		await pollAsOwner();

		expect(await balance(ctx.db)).toBe(TOKEN_COST);
	});
});

describe('GET /api/spin/[id]/status — video creation succeeds', () => {
	beforeEach(() => {
		falStatusMock.mockResolvedValue({
			status: 'COMPLETED',
			output: { frames: ['https://example.com/frame-1.png'] },
		});
		createSpinVideoMock.mockResolvedValue(Buffer.from('mp4'));
	});

	it('stores the video and leaves the balance alone', async () => {
		const response = await pollAsOwner();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({
			id: JOB_ID,
			status: 'completed',
			progress: 100,
			videoUrl: 'https://blob.example/video.mp4',
			inputImageUrl: 'https://example.com/input.png',
		});
		expect(await balance(ctx.db)).toBe(0);
	});

	// A refunded job must not also be handed its asset. ffmpeg runs for tens of
	// seconds, which is plenty of time for the Cancel the user just pressed to
	// settle the job and pay them back.
	it('does not hand over the video for a job a cancel already refunded', async () => {
		createSpinVideoMock.mockImplementation(async () => {
			await cancelElsewhere();
			return Buffer.from('mp4');
		});

		const response = await pollAsOwner();

		const row = await jobRow(ctx.db);
		expect.soft(row.status).toBe('failed');
		expect.soft(row.videoUrl).toBeNull();
		expect.soft(await balance(ctx.db)).toBe(TOKEN_COST);
		expect.soft((await response.json()).status).toBe('failed');
	});
});

describe('GET /api/spin/[id]/status — guest-owned job', () => {
	beforeEach(async () => {
		await ctx.db.insert(table.guestSession).values({
			id: 'guest-1',
			ipAddress: '127.0.0.1',
			expiresAt: new Date(Date.now() + 60_000),
		});
		await ctx.db
			.update(table.spinJob)
			.set({ userId: null, guestSessionId: 'guest-1' })
			.where(eq(table.spinJob.id, JOB_ID));
		falStatusMock.mockResolvedValue({
			status: 'FAILED',
			error: 'Job failed on fal.ai',
		});
	});

	// A guest holds no balance, so there is nothing to credit — but the job must
	// still be claimed and reported as failed.
	it('fails the job without crediting anyone', async () => {
		const response = await get({
			params: { id: JOB_ID },
			locals: { guestSession: { id: 'guest-1' } },
		});

		expect(response.status).toBe(200);
		expect((await response.json()).status).toBe('failed');
		expect(await balance(ctx.db)).toBe(0);
	});
});
