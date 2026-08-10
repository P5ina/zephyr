/**
 * Money invariant for the animation failure path.
 *
 * `/api/animate/generate` submits one fal.ai job per direction (4 or 8), each
 * carrying the SAME jobId in its webhook URL plus its own `&direction=`. When
 * the underlying model fails, fal.ai calls this webhook once per direction —
 * N ERROR callbacks for a single job whose cost was charged once.
 *
 * The invariant asserted here is therefore about the job, not the callback:
 * a failed animation job refunds `tokenCost` exactly once, however many
 * direction webhooks arrive for it.
 *
 * `handleAnimate`'s ERROR branch reads the job, checks `job.status !== 'failed'`
 * against that in-memory copy, credits the user, and only then writes
 * status='failed' in a separate statement — a read-check-write spread across
 * await points. PGlite serialises individual queries but cannot serialise a
 * handler's continuations, so the interleaving these tests exercise is the real
 * one.
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
import { getAnimationGenerationTokenCost } from '$lib/pricing';
import { DIRECTIONS_8 } from '$lib/animation-config';

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
	env: { FAL_WEBHOOK_SECRET: 'test-webhook-secret' },
}));

vi.mock('$lib/server/fal', () => ({
	submitRestyleGeneration: vi.fn(async () => ({ requestId: 'unused' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => undefined),
}));

const { POST } = await import('./+server');

const SECRET = 'test-webhook-secret';
const USER_ID = 'user-anim-1';
const JOB_ID = 'anim-job-1';
const TOKEN_COST = getAnimationGenerationTokenCost('run', 8);

function errorWebhook(direction: string) {
	const url = new URL(
		`https://app.test/api/webhooks/fal?secret=${SECRET}&type=animate&jobId=${JOB_ID}&direction=${direction}`,
	);
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			request_id: `req-${direction}`,
			status: 'ERROR',
			error: 'Inference failed',
		}),
	});

	return (
		POST as unknown as (event: {
			url: URL;
			request: Request;
		}) => Promise<Response>
	)({ url, request });
}

async function balance(ctx: TestDatabase) {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

describe('POST /api/webhooks/fal — animate ERROR refund', () => {
	let ctx: TestDatabase;

	beforeAll(async () => {
		ctx = await createTestDatabase();
		holder.db = ctx.db;
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	beforeEach(async () => {
		await ctx.reset();
		await ctx.db.insert(table.user).values({
			id: USER_ID,
			email: 'anim@example.com',
			tokens: 0,
			bonusTokens: 0,
		});

		// The job as `/api/animate/generate` leaves it: charged once, one fal
		// request per direction, all eight in flight.
		const falRequestIds = Object.fromEntries(
			DIRECTIONS_8.map((d) => [d, `fal-req-${d}`]),
		);
		await ctx.db.insert(table.animationJob).values({
			id: JOB_ID,
			userId: USER_ID,
			status: 'processing',
			progress: 5,
			animationType: 'run',
			elevation: 'side',
			directionCount: 8,
			falRequestIds,
			tokenCost: TOKEN_COST,
			bonusTokenCost: 0,
		});
	});

	// Fixture sanity: a wrong cost would make the money assertions meaningless.
	it('the seeded job carries the real price of an 8-direction run', async () => {
		const [row] = await ctx.db
			.select()
			.from(table.animationJob)
			.where(eq(table.animationJob.id, JOB_ID));
		expect(row.tokenCost).toBe(getAnimationGenerationTokenCost('run', 8));
	});

	it('a single failing direction refunds the job cost exactly once', async () => {
		await errorWebhook('south');
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});

	it('marks the whole job failed when one direction errors', async () => {
		await errorWebhook('south');
		const [row] = await ctx.db
			.select()
			.from(table.animationJob)
			.where(eq(table.animationJob.id, JOB_ID));
		expect(row.status).toBe('failed');
	});

	it('a second, sequential direction webhook does not refund again', async () => {
		await errorWebhook('south');
		await errorWebhook('west');
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});

	// The money invariant. All eight directions of one job fail at the same
	// moment — the ordinary failure mode, no attacker involved. The user paid
	// TOKEN_COST once and must be refunded TOKEN_COST once.
	it('eight concurrent direction webhooks refund exactly once in total', async () => {
		await Promise.allSettled(DIRECTIONS_8.map((d) => errorWebhook(d)));
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});
});
