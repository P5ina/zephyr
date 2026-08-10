/**
 * Guest quota invariants for POST /api/spin/generate.
 *
 * The product rule is "an anonymous visitor gets GUEST_CONFIG.maxGenerations
 * free spins". These tests are written against that rule, not against the
 * current implementation. The implementation enforces the rule against a
 * `guest-session` cookie that the caller volunteers: when the cookie is
 * missing the handler mints a brand new session with `generationsUsed = 0`
 * and immediately asks `canGuestGenerate` — which is `0 < 3` — so a client
 * that simply never sends the cookie is never counted at all. The
 * `ip_address` column recorded on every guest session is written and then
 * never read by any query.
 *
 * Tests 2 and 3 are therefore expected to be RED until the quota is enforced
 * against something the client cannot discard.
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
import { GUEST_CONFIG } from '$lib/guest-config';
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

vi.mock('$env/dynamic/private', () => ({
	env: {
		BLOB_READ_WRITE_TOKEN: 'test-blob-token',
		FAL_KEY: 'test-fal-key',
	},
}));

vi.mock('@vercel/blob', () => ({
	put: vi.fn(async (pathname: string) => ({
		url: `https://blob.test/${pathname}`,
		pathname,
	})),
}));

vi.mock('$lib/server/fal', () => ({
	submitSpinJob: vi.fn(async () => ({ requestId: 'fal-req-test' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://test.local/api/webhooks/fal'),
}));

const { POST } = await import('./+server');

/** 1x1 PNG — real bytes, so the handler's sharp pipeline runs for real. */
const PNG_1X1 = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
	'base64',
);

const GUEST_IP = '203.0.113.7';
const SESSION_ID = 'guest-session-1';

type GuestEvent = {
	request: Request;
	locals: { user: null; guestSession: table.GuestSession | null };
	getClientAddress: () => string;
};

function imageRequest(): Request {
	const form = new FormData();
	form.append(
		'image',
		new File([new Uint8Array(PNG_1X1)], 'input.png', { type: 'image/png' }),
	);
	return new Request('http://localhost/api/spin/generate', {
		method: 'POST',
		body: form,
	});
}

function generate(options: {
	guestSession?: table.GuestSession | null;
	ip?: string;
}): Promise<Response> {
	return (POST as unknown as (event: GuestEvent) => Promise<Response>)({
		request: imageRequest(),
		locals: { user: null, guestSession: options.guestSession ?? null },
		getClientAddress: () => options.ip ?? GUEST_IP,
	});
}

describe('POST /api/spin/generate — guest quota', () => {
	let ctx: TestDatabase;

	/** Mirrors hooks.server.ts: the cookie is re-read from the DB each request. */
	async function loadSession(id: string): Promise<table.GuestSession> {
		const [row] = await ctx.db
			.select()
			.from(table.guestSession)
			.where(eq(table.guestSession.id, id));
		return row;
	}

	async function seedSession(
		id: string,
		generationsUsed: number,
		ipAddress = GUEST_IP,
	): Promise<table.GuestSession> {
		const [row] = await ctx.db
			.insert(table.guestSession)
			.values({
				id,
				ipAddress,
				generationsUsed,
				expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
			})
			.returning();
		return row;
	}

	async function jobCount(): Promise<number> {
		const rows = await ctx.db
			.select({ id: table.spinJob.id })
			.from(table.spinJob);
		return rows.length;
	}

	beforeAll(async () => {
		ctx = await createTestDatabase();
		holder.db = ctx.db;
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	beforeEach(async () => {
		await ctx.reset();
	});

	// Baseline: the cookie-carrying path does honour the cap. This one is green,
	// and it is what makes the two below meaningful — the rule exists, it is just
	// trivially opted out of.
	it('cuts a cookie-carrying guest off after GUEST_CONFIG.maxGenerations', async () => {
		await seedSession(SESSION_ID, 0);

		for (let i = 0; i < GUEST_CONFIG.maxGenerations; i++) {
			const response = await generate({
				guestSession: await loadSession(SESSION_ID),
			});
			expect(response.status).toBe(200);
		}

		await expect(
			generate({ guestSession: await loadSession(SESSION_ID) }),
		).rejects.toMatchObject({ status: 429 });

		expect(await jobCount()).toBe(GUEST_CONFIG.maxGenerations);
	});

	// The invariant. A caller that never sends the cookie is still one anonymous
	// visitor and must still be capped. Today every call mints a fresh session
	// with generationsUsed = 0, so the cap never binds.
	it('caps an anonymous caller that never sends a guest session', async () => {
		const attempts = GUEST_CONFIG.maxGenerations + 2;

		let accepted = 0;
		for (let i = 0; i < attempts; i++) {
			try {
				const response = await generate({ guestSession: null });
				if (response.status === 200) accepted++;
			} catch {
				// 429 once the cap is enforced — that is the point of the test.
			}
		}

		expect(accepted).toBeLessThanOrEqual(GUEST_CONFIG.maxGenerations);
		expect(await jobCount()).toBeLessThanOrEqual(GUEST_CONFIG.maxGenerations);
	});

	// The ip_address column is written on every guest session and read by nothing.
	// If the quota were enforced against it, an exhausted IP could not buy more
	// generations by dropping its cookie.
	it('consults the recorded ip address when a caller drops its cookie', async () => {
		await seedSession(SESSION_ID, GUEST_CONFIG.maxGenerations);

		await expect(
			generate({ guestSession: null, ip: GUEST_IP }),
		).rejects.toMatchObject({ status: 429 });

		expect(await jobCount()).toBe(0);
	});
});
