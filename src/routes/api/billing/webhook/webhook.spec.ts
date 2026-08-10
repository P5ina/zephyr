/**
 * Money invariants for the Stripe billing webhook.
 *
 * Stripe delivery is at-least-once: a `checkout.session.completed` event is
 * retried on timeout, on a non-2xx, and can simply be delivered twice. Every
 * delivery carries the same `transactionId` in its metadata, so the handler has
 * to be safe to receive N times for one payment.
 *
 * Unlike a refund, a duplicate grant here is free credit — 3000 bonus tokens
 * for one $50 pack — so the invariant asserted is about the transaction, not
 * the delivery: a paid transaction grants `tokensGranted` exactly once, however
 * many deliveries arrive for it.
 *
 * On PGlite: it serialises individual queries, but the defect this guards
 * against is an application-level read-check-write spread across `await`
 * points, so two concurrent handler invocations still interleave on the event
 * loop and the race reproduces faithfully.
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
import { PRICING } from '$lib/pricing';

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
	env: { STRIPE_WEBHOOK_SECRET: 'whsec_test' },
}));

// Signature verification is out of scope here: the body is already the parsed
// event, so `constructEvent` just hands it back. What is under test is what the
// handler does once an event is known to be authentic.
vi.mock('$lib/server/stripe', () => ({
	getStripe: () => ({
		webhooks: {
			constructEvent: (body: string) => JSON.parse(body),
		},
	}),
}));

vi.mock('$lib/server/posthog', () => ({
	getPostHogClient: () => ({
		capture: vi.fn(),
		flush: vi.fn(async () => undefined),
	}),
}));

const { POST } = await import('./+server');

const USER_ID = 'user-billing-1';
const TXN_ID = 'txn-1';
const PACK = PRICING.creditPacks.studio;

function deliver(event: unknown) {
	const request = new Request('https://app.test/api/billing/webhook', {
		method: 'POST',
		headers: {
			'content-type': 'application/json',
			'stripe-signature': 't=1,v1=whatever',
		},
		body: JSON.stringify(event),
	});

	return (
		POST as unknown as (event: { request: Request }) => Promise<Response>
	)({ request });
}

function completedEvent() {
	return deliver({
		type: 'checkout.session.completed',
		data: {
			object: {
				id: 'cs_test_1',
				metadata: {
					userId: USER_ID,
					transactionId: TXN_ID,
					packType: 'studio',
				},
			},
		},
	});
}

function expiredEvent() {
	return deliver({
		type: 'checkout.session.expired',
		data: {
			object: {
				id: 'cs_test_1',
				metadata: { userId: USER_ID, transactionId: TXN_ID },
			},
		},
	});
}

async function balance(ctx: TestDatabase) {
	const [row] = await ctx.db
		.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
		.from(table.user)
		.where(eq(table.user.id, USER_ID));
	return row.tokens + row.bonus;
}

async function txnStatus(ctx: TestDatabase) {
	const [row] = await ctx.db
		.select()
		.from(table.transaction)
		.where(eq(table.transaction.id, TXN_ID));
	return row.status;
}

describe('POST /api/billing/webhook', () => {
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
			email: 'buyer@example.com',
			tokens: 0,
			bonusTokens: 0,
		});
		// The transaction as `/api/billing/checkout` leaves it.
		await ctx.db.insert(table.transaction).values({
			id: TXN_ID,
			userId: USER_ID,
			type: 'credit_pack',
			amount: PACK.price,
			tokensGranted: PACK.tokens,
			status: 'pending',
			payCurrency: 'usd',
			payAmount: String(PACK.price),
			orderId: 'cs_test_1',
		});
	});

	it('grants the pack once and completes the transaction', async () => {
		const response = await completedEvent();

		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ received: true });
		expect(await balance(ctx)).toBe(PACK.tokens);
		expect(await txnStatus(ctx)).toBe('completed');
	});

	it('a redelivered event does not grant a second time', async () => {
		await completedEvent();
		const retry = await completedEvent();

		// Stripe must still see a 2xx, or it keeps retrying forever.
		expect(retry.status).toBe(200);
		expect(await balance(ctx)).toBe(PACK.tokens);
	});

	// The money invariant. Two deliveries of one payment land at the same moment
	// — Stripe's ordinary retry behaviour, no attacker involved. The user paid
	// once and must be granted once.
	it('two concurrent deliveries grant exactly once', async () => {
		await Promise.allSettled([completedEvent(), completedEvent()]);
		expect(await balance(ctx)).toBe(PACK.tokens);
	});

	it('ten concurrent deliveries grant exactly once', async () => {
		await Promise.allSettled(Array.from({ length: 10 }, completedEvent));
		expect(await balance(ctx)).toBe(PACK.tokens);
	});

	it('grants nothing for a transaction that is not pending', async () => {
		await ctx.db
			.update(table.transaction)
			.set({ status: 'expired' })
			.where(eq(table.transaction.id, TXN_ID));

		const response = await completedEvent();

		expect(response.status).toBe(200);
		expect(await balance(ctx)).toBe(0);
		expect(await txnStatus(ctx)).toBe('expired');
	});

	it('an expired event cannot un-complete a granted purchase', async () => {
		await completedEvent();
		await expiredEvent();

		expect(await txnStatus(ctx)).toBe('completed');
		expect(await balance(ctx)).toBe(PACK.tokens);
	});

	it('an expired event still expires a pending transaction', async () => {
		await expiredEvent();
		expect(await txnStatus(ctx)).toBe('expired');
	});

	it('rejects a request with no signature header', async () => {
		const response = await (
			POST as unknown as (event: { request: Request }) => Promise<Response>
		)({
			request: new Request('https://app.test/api/billing/webhook', {
				method: 'POST',
				body: '{}',
			}),
		});

		expect(response.status).toBe(400);
		expect(await balance(ctx)).toBe(0);
	});
});
