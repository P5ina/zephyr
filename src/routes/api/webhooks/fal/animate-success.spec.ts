/**
 * The animation success path, which nothing covered.
 *
 * `/api/animate/generate` submits one fal.ai job per direction, so completion
 * arrives as N independent webhooks that each have to merge their own video URL
 * into one shared column. `handleAnimate` does that with a jsonb merge —
 * `COALESCE(direction_videos, '{}'::jsonb) || $1::jsonb` — precisely so two
 * callbacks landing together cannot clobber each other.
 *
 * The existing animate spec exercises the ERROR branch, and the terminal-state
 * spec exercises sprite and concept-art. Neither ever runs this statement, which
 * is how it shipped broken: `direction_videos` is declared `json`, the merge
 * speaks `jsonb`, and Postgres refuses to bridge the two.
 *
 * Consequence in production: the webhook 500s, fal retries about three times
 * over half a minute and gives up, and the direction is never recorded. The
 * animation only advances while the browser is polling — close the tab and the
 * job sits in `processing` forever with the tokens already spent.
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
const USER_ID = 'user-anim-ok';
const JOB_ID = 'anim-job-ok';
const TOKEN_COST = getAnimationGenerationTokenCost('run', 8);

function videoUrl(direction: string) {
	return `https://v3b.fal.media/files/b/${direction}.mp4`;
}

function successWebhook(direction: string) {
	const url = new URL(
		`https://app.test/api/webhooks/fal?secret=${SECRET}&type=animate&jobId=${JOB_ID}&direction=${direction}`,
	);
	const request = new Request(url, {
		method: 'POST',
		headers: { 'content-type': 'application/json' },
		body: JSON.stringify({
			request_id: `req-${direction}`,
			status: 'OK',
			payload: { video: { url: videoUrl(direction) } },
		}),
	});

	return (
		POST as unknown as (event: {
			url: URL;
			request: Request;
		}) => Promise<Response>
	)({ url, request });
}

async function job(ctx: TestDatabase) {
	const [row] = await ctx.db
		.select()
		.from(table.animationJob)
		.where(eq(table.animationJob.id, JOB_ID));
	return row;
}

async function directionVideos(ctx: TestDatabase) {
	return ((await job(ctx)).directionVideos ?? {}) as Record<string, string>;
}

describe('POST /api/webhooks/fal — animate OK merge', () => {
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
			email: 'anim-ok@example.com',
			tokens: 0,
			bonusTokens: 0,
		});
		await ctx.db.insert(table.animationJob).values({
			id: JOB_ID,
			userId: USER_ID,
			status: 'processing',
			progress: 5,
			animationType: 'run',
			elevation: 'side',
			directionCount: 8,
			falRequestIds: Object.fromEntries(
				DIRECTIONS_8.map((d) => [d, `fal-req-${d}`]),
			),
			tokenCost: TOKEN_COST,
			bonusTokenCost: 0,
		});
	});

	it('records the video of a finished direction', async () => {
		await successWebhook('north');

		expect(await directionVideos(ctx)).toEqual({ north: videoUrl('north') });
	});

	// The whole reason the write is a merge rather than an assignment: each
	// callback knows only its own direction and must not erase the others.
	it('accumulates directions instead of overwriting them', async () => {
		await successWebhook('north');
		await successWebhook('east');
		await successWebhook('south');

		expect(await directionVideos(ctx)).toEqual({
			north: videoUrl('north'),
			east: videoUrl('east'),
			south: videoUrl('south'),
		});
	});

	// The case the merge exists for. Eight callbacks for one job arrive together
	// when the model finishes its batch; none may be lost.
	it('keeps every direction when all eight arrive at once', async () => {
		await Promise.allSettled(DIRECTIONS_8.map((d) => successWebhook(d)));

		const videos = await directionVideos(ctx);
		expect(Object.keys(videos).sort()).toEqual([...DIRECTIONS_8].sort());
	});

	it('reports progress once directions start landing', async () => {
		await successWebhook('north');

		expect((await job(ctx)).progress).toBeGreaterThan(5);
	});
});
