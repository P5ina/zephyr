/**
 * Invariants for the refund path. These are written against the behaviour the
 * code MUST have, not the behaviour it has today — the concurrency test below
 * is expected to be red until the refund is made an atomic claim.
 *
 * Note on PGlite: it serialises individual queries, but the defect here is an
 * application-level read-check-write spread across `await` points, so two
 * concurrent handler invocations still interleave on the event loop. The race
 * reproduces faithfully.
 */
import {
	beforeEach,
	afterAll,
	beforeAll,
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

vi.mock('$lib/server/runpod', () => ({
	cancelJob: vi.fn(async () => undefined),
}));

const { POST } = await import('./+server');

const USER_ID = 'user-1';
const TEXTURE_ID = 'tex-1';
const TOKEN_COST = 4;

function cancelRequest() {
	return (
		POST as unknown as (event: {
			params: { id: string };
			locals: { user: { id: string } };
		}) => Promise<Response>
	)({
		params: { id: TEXTURE_ID },
		locals: { user: { id: USER_ID } },
	});
}

async function balance(ctx: TestDatabase) {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

describe('POST /api/textures/[id]/cancel', () => {
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
		await ctx.db
			.insert(table.user)
			.values({
				id: USER_ID,
				email: 'u@example.com',
				tokens: 0,
				bonusTokens: 0,
			});
		await ctx.db.insert(table.textureGeneration).values({
			id: TEXTURE_ID,
			userId: USER_ID,
			prompt: 'test',
			status: 'processing',
			tokenCost: TOKEN_COST,
			bonusTokenCost: 0,
		});
	});

	it('refunds the token cost once', async () => {
		await cancelRequest();
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});

	it('marks the generation failed', async () => {
		await cancelRequest();
		const [row] = await ctx.db
			.select()
			.from(table.textureGeneration)
			.where(eq(table.textureGeneration.id, TEXTURE_ID));
		expect(row.status).toBe('failed');
		expect(row.errorMessage).toBe('Cancelled by user');
	});

	it('a second, sequential cancel does not refund again', async () => {
		await cancelRequest();
		await expect(cancelRequest()).rejects.toMatchObject({ status: 400 });
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});

	// The money invariant. Two requests that arrive together must still produce
	// exactly one refund — the state transition, not a prior read, has to be
	// what gates the credit.
	it('two concurrent cancels refund exactly once', async () => {
		await Promise.allSettled([cancelRequest(), cancelRequest()]);
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});

	it('twenty concurrent cancels refund exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 20 }, () => cancelRequest()));
		expect(await balance(ctx)).toBe(TOKEN_COST);
	});
});
