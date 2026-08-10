/**
 * Invariants for token deduction on the concept-art generate path.
 *
 * These are written against the behaviour the code MUST have. The concurrency
 * tests fail against a handler that checks `locals.user` and then deducts
 * unconditionally, and pass only once the affordability predicate lives in the
 * WHERE of the write.
 *
 * Note on faithfulness: `locals.user` is a snapshot the auth hook loads once
 * per request, so N requests that arrive together all carry the balance as it
 * stood before any of them deducted. The tests reproduce that literally — they
 * read N snapshots from the database first, then hand each one to its own
 * handler invocation. No interleaving luck is required.
 *
 * This endpoint prices two shapes of request differently: a plain generation
 * costs `conceptArt`, a restyle costs `conceptArtRestyle`. Both paths are
 * charged here, because the cost the request resolves to is only known after
 * the body has been parsed.
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
import { PRICING } from '$lib/pricing';
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

// Both fal.ai submissions the handler can reach, so no fal client is
// constructed and no network call is attempted.
vi.mock('$lib/server/fal', () => ({
	submitConceptArtJob: vi.fn(async () => ({ requestId: 'fal-concept-art' })),
	submitPreprocessorJob: vi.fn(async () => ({ requestId: 'fal-preprocessor' })),
}));

// Reached only by the legacy raw-file upload branch, which these tests do not
// take; mocked so an accidental call cannot hit Vercel Blob.
vi.mock('@vercel/blob', () => ({
	put: vi.fn(async () => ({ url: 'https://blob.test/image.png' })),
}));

vi.mock('$lib/server/posthog', () => ({
	getPostHogClient: () => ({
		capture: vi.fn(),
		flush: vi.fn(async () => undefined),
	}),
}));

const fal = await import('$lib/server/fal');
const { POST } = await import('./+server');

const USER_ID = 'user-1';
const TOKEN_COST = PRICING.tokenCosts.conceptArt;
const RESTYLE_TOKEN_COST = PRICING.tokenCosts.conceptArtRestyle;
const CONCURRENT_REQUESTS = 10;
const COMPOSITION_URL = 'https://blob.test/composition.png';

interface UserSnapshot {
	id: string;
	tokens: number;
	bonusTokens: number;
}

let ctx: TestDatabase;

/** What the auth hook puts on `locals.user`: a read, taken once per request. */
async function loadSnapshot(): Promise<UserSnapshot> {
	const [row] = await ctx.db
		.select({
			id: table.user.id,
			tokens: table.user.tokens,
			bonusTokens: table.user.bonusTokens,
		})
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row;
}

function invoke(user: UserSnapshot, request: Request) {
	return (
		POST as unknown as (event: {
			request: Request;
			locals: { user: UserSnapshot };
		}) => Promise<Response>
	)({ request, locals: { user } });
}

/** A plain generation: JSON body, priced at `conceptArt`. */
function generateRequest(user: UserSnapshot) {
	return invoke(
		user,
		new Request('http://localhost/api/concept-art/generate', {
			method: 'POST',
			headers: { 'content-type': 'application/json' },
			body: JSON.stringify({ prompt: 'ruined observatory on a cliff' }),
		}),
	);
}

/** A restyle: multipart body carrying a composition image, priced higher. */
function restyleRequest(user: UserSnapshot) {
	const form = new FormData();
	form.set('prompt', 'ruined observatory on a cliff');
	form.set('mode', 'restyle');
	form.set('compositionImageUrl', COMPOSITION_URL);
	form.set('controlMethod', 'canny');

	return invoke(
		user,
		new Request('http://localhost/api/concept-art/generate', {
			method: 'POST',
			body: form,
		}),
	);
}

async function seedUser(tokens: number, bonusTokens = 0) {
	await ctx.db.insert(table.user).values({
		id: USER_ID,
		email: 'u@example.com',
		tokens,
		bonusTokens,
	});
}

async function balance() {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

function generations() {
	return ctx.db
		.select()
		.from(table.conceptArtGeneration)
		.where(eq(table.conceptArtGeneration.userId, USER_ID));
}

describe('POST /api/concept-art/generate', () => {
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

	it('rejects a user who cannot afford the cost and deducts nothing', async () => {
		await seedUser(TOKEN_COST - 1);

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 402,
		});

		expect(await balance()).toBe(TOKEN_COST - 1);
		expect(await generations()).toHaveLength(0);
	});

	it('spends exactly one generation worth of credit on one request', async () => {
		await seedUser(TOKEN_COST);

		await generateRequest(await loadSnapshot());

		expect(await balance()).toBe(0);
		expect(await generations()).toHaveLength(1);
	});

	// The response must describe the row, not the snapshot's arithmetic, and the
	// job must record the bucket split so a later refund pays back what was taken.
	it('spends bonus credit first and reports the balances the charge left', async () => {
		await seedUser(TOKEN_COST + 3, 1);

		const response = await generateRequest(await loadSnapshot());
		const body = await response.json();

		expect(body).toMatchObject({
			status: 'pending',
			tokensRemaining: TOKEN_COST + 3 - (TOKEN_COST - 1),
			bonusTokensRemaining: 0,
		});

		const [job] = await generations();
		expect(job.tokenCost).toBe(TOKEN_COST);
		expect(job.bonusTokenCost).toBe(1);
	});

	// The money invariant. Ten requests carrying the same pre-deduction snapshot
	// must never spend credit the account does not have: the balance floor is 0,
	// never negative, no matter how the requests interleave.
	it('never lets concurrent generates overdraw the balance', async () => {
		await seedUser(TOKEN_COST);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await balance()).toBe(0);
	});

	// The other half of the same invariant: credit for one generation must buy
	// one generation, not ten.
	it('grants exactly one generation for one generation worth of credit', async () => {
		await seedUser(TOKEN_COST);

		const snapshots = await Promise.all(
			Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
		);
		await Promise.allSettled(snapshots.map((user) => generateRequest(user)));

		expect(await generations()).toHaveLength(1);
	});

	it('refunds and fails the job when the fal.ai submission is rejected', async () => {
		await seedUser(TOKEN_COST);
		vi.mocked(fal.submitConceptArtJob).mockRejectedValueOnce(
			new Error('fal.ai unavailable'),
		);

		await expect(generateRequest(await loadSnapshot())).rejects.toMatchObject({
			status: 500,
		});

		expect(await balance()).toBe(TOKEN_COST);
		const [job] = await generations();
		expect(job.status).toBe('failed');
	});

	describe('restyle mode', () => {
		it('charges the restyle price, not the plain generation price', async () => {
			await seedUser(RESTYLE_TOKEN_COST);

			const response = await restyleRequest(await loadSnapshot());
			const body = await response.json();

			expect(body.tokensRemaining).toBe(0);
			expect(await balance()).toBe(0);

			const [job] = await generations();
			expect(job.mode).toBe('restyle');
			expect(job.tokenCost).toBe(RESTYLE_TOKEN_COST);
		});

		it('rejects a balance that covers a plain generation but not a restyle', async () => {
			// Guards against charging the cheaper cost on the pricier path.
			expect(TOKEN_COST).toBeLessThan(RESTYLE_TOKEN_COST);
			await seedUser(RESTYLE_TOKEN_COST - 1);

			await expect(restyleRequest(await loadSnapshot())).rejects.toMatchObject({
				status: 402,
			});

			expect(await balance()).toBe(RESTYLE_TOKEN_COST - 1);
			expect(await generations()).toHaveLength(0);
		});

		// The money invariant on the pricier path.
		it('grants exactly one restyle for one restyle worth of credit', async () => {
			await seedUser(RESTYLE_TOKEN_COST);

			const snapshots = await Promise.all(
				Array.from({ length: CONCURRENT_REQUESTS }, () => loadSnapshot()),
			);
			await Promise.allSettled(snapshots.map((user) => restyleRequest(user)));

			expect(await generations()).toHaveLength(1);
			expect(await balance()).toBe(0);
		});
	});
});
