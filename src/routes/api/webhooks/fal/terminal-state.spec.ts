/**
 * Terminal-state invariants for the fal webhook (defects C5 / C7).
 *
 * The scenario is the real one, not a contrived one: fal.queue.cancel only
 * succeeds while a request is still queued. Once the request is RUNNING, the
 * cancel call throws — and every cancel endpoint swallows that error, marks the
 * row 'failed' / 'Cancelled by user' and refunds the tokens anyway. fal then
 * finishes the work it was never actually told to stop and POSTs a success
 * webhook.
 *
 * The webhook success handlers write status:'completed' with
 * `WHERE id = jobId` and no predicate on the current status, so the refunded,
 * cancelled row is resurrected. The user keeps the credits AND gets the asset.
 *
 * These assertions are written as the invariants the system MUST hold, so they
 * are expected to be red against today's production code:
 *
 *   I1  'failed' is terminal — a late success webhook cannot move a row out of
 *       it.
 *   I2  A row is never simultaneously 'completed' and carrying a cancellation
 *       errorMessage. That both-states-at-once row is what corrupts failure
 *       analytics.
 *   I3  A refunded balance is never accompanied by a delivered result URL.
 *       Refund XOR asset — never both.
 *
 * Covered for the sprite (asset_generation) and concept-art
 * (concept_art_generation) paths, which are two of the four unguarded success
 * writes (the rotation4 / rotation8 handlers have the identical shape).
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

vi.mock('$env/dynamic/private', () => ({
	env: { FAL_WEBHOOK_SECRET: 'test-webhook-secret' },
}));

/**
 * fal.queue.cancel on a request that has already left the queue. This is the
 * production failure mode that makes the whole race possible.
 */
const alreadyRunning = () => {
	throw new Error('Request is already in progress and cannot be cancelled');
};

vi.mock('$lib/server/fal', () => ({
	cancelSpriteJob: vi.fn(async () => alreadyRunning()),
	cancelConceptArtJob: vi.fn(async () => alreadyRunning()),
	cancelRestyleJob: vi.fn(async () => alreadyRunning()),
	submitRestyleGeneration: vi.fn(async () => ({ requestId: 'unused' })),
}));

vi.mock('$lib/server/fal-webhook', () => ({
	buildFalWebhookUrl: vi.fn(() => 'https://example.test/api/webhooks/fal'),
}));

const { POST: webhookPOST } = await import('./+server');
const { POST: cancelAssetPOST } =
	await import('../../assets/[id]/cancel/+server');
const { POST: cancelConceptArtPOST } =
	await import('../../concept-art/[id]/cancel/+server');

const SECRET = 'test-webhook-secret';
const USER_ID = 'user-1';
const SPRITE_ID = 'asset-1';
const CONCEPT_ID = 'concept-1';
const TOKEN_COST = 6;
const SPRITE_URL = 'https://fal.media/files/late-sprite.png';
const CONCEPT_URL = 'https://fal.media/files/late-concept.png';

interface WebhookPayload {
	request_id: string;
	status: 'OK' | 'ERROR';
	payload?: unknown;
	error?: string;
}

/** POSTs a fal webhook at the real handler. */
function deliverWebhook(type: string, jobId: string, body: WebhookPayload) {
	return (
		webhookPOST as unknown as (event: {
			url: URL;
			request: { json: () => Promise<unknown> };
		}) => Promise<Response>
	)({
		url: new URL(
			`https://app.test/api/webhooks/fal?secret=${SECRET}&type=${type}&jobId=${jobId}`,
		),
		request: { json: async () => body },
	});
}

function cancelSprite() {
	return (
		cancelAssetPOST as unknown as (event: {
			params: { id: string };
			locals: { user: { id: string }; guestSession: null };
			url: URL;
		}) => Promise<Response>
	)({
		params: { id: SPRITE_ID },
		locals: { user: { id: USER_ID }, guestSession: null },
		url: new URL(`https://app.test/api/assets/${SPRITE_ID}/cancel`),
	});
}

function cancelConceptArt() {
	return (
		cancelConceptArtPOST as unknown as (event: {
			params: { id: string };
			locals: { user: { id: string } };
		}) => Promise<Response>
	)({
		params: { id: CONCEPT_ID },
		locals: { user: { id: USER_ID } },
	});
}

describe('fal webhook must not resurrect a cancelled, refunded job', () => {
	let ctx: TestDatabase;

	async function balance() {
		const [row] = await ctx.db
			.select({ tokens: table.user.tokens, bonus: table.user.bonusTokens })
			.from(table.user)
			.where(eq(table.user.id, USER_ID));
		return row.tokens + row.bonus;
	}

	async function spriteRow() {
		const [row] = await ctx.db
			.select()
			.from(table.assetGeneration)
			.where(eq(table.assetGeneration.id, SPRITE_ID));
		return row;
	}

	async function conceptRow() {
		const [row] = await ctx.db
			.select()
			.from(table.conceptArtGeneration)
			.where(eq(table.conceptArtGeneration.id, CONCEPT_ID));
		return row;
	}

	/** Cancel while fal is already running, then let the success webhook land. */
	async function cancelThenLateSpriteSuccess() {
		await cancelSprite();
		await deliverWebhook('sprite', SPRITE_ID, {
			request_id: 'fal-sprite-req',
			status: 'OK',
			payload: { image: { url: SPRITE_URL }, seed: 42 },
		});
	}

	async function cancelThenLateConceptSuccess() {
		await cancelConceptArt();
		await deliverWebhook('conceptart', CONCEPT_ID, {
			request_id: 'fal-concept-req',
			status: 'OK',
			payload: { images: [{ url: CONCEPT_URL }], seed: 7 },
		});
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
		await ctx.db.insert(table.user).values({
			id: USER_ID,
			email: 'u@example.com',
			tokens: 0,
			bonusTokens: 0,
		});
		await ctx.db.insert(table.assetGeneration).values({
			id: SPRITE_ID,
			visibleId: 'asset-visible-1',
			userId: USER_ID,
			assetType: 'sprite',
			prompt: 'a knight',
			status: 'processing',
			progress: 40,
			runpodJobId: 'fal-sprite-req',
			tokenCost: TOKEN_COST,
			bonusTokenCost: 0,
		});
		await ctx.db.insert(table.conceptArtGeneration).values({
			id: CONCEPT_ID,
			userId: USER_ID,
			prompt: 'a castle',
			status: 'processing',
			progress: 40,
			falRequestId: 'fal-concept-req',
			tokenCost: TOKEN_COST,
			bonusTokenCost: 0,
		});
	});

	describe('sprite / asset_generation', () => {
		// Precondition, not an invariant under test: this documents the state the
		// cancel endpoint actually leaves behind when fal refuses the cancel.
		it('cancel refunds and fails the job even though fal refused the cancel', async () => {
			await cancelSprite();
			const row = await spriteRow();
			expect({
				status: row.status,
				errorMessage: row.errorMessage,
				balance: await balance(),
			}).toEqual({
				status: 'failed',
				errorMessage: 'Cancelled by user',
				balance: TOKEN_COST,
			});
		});

		// I1: 'failed' is terminal. A success webhook arriving after the user
		// cancelled must be ignored, not applied.
		it("I1 keeps a cancelled job 'failed' when a late success webhook lands", async () => {
			await cancelThenLateSpriteSuccess();
			expect((await spriteRow()).status).toBe('failed');
		});

		// I2: no row is ever completed AND carrying a cancellation reason.
		it('I2 never leaves a row both completed and cancellation-flagged', async () => {
			await cancelThenLateSpriteSuccess();
			const row = await spriteRow();
			expect({
				status: row.status,
				errorMessage: row.errorMessage,
			}).not.toEqual({
				status: 'completed',
				errorMessage: 'Cancelled by user',
			});
		});

		// I3: the refund and the asset are mutually exclusive. The user was made
		// whole, so the result must not also be delivered.
		it('I3 does not deliver the asset to a user who was already refunded', async () => {
			await cancelThenLateSpriteSuccess();
			const row = await spriteRow();
			expect({
				balance: await balance(),
				deliveredUrl: row.resultUrls?.processed ?? null,
			}).toEqual({ balance: TOKEN_COST, deliveredUrl: null });
		});
	});

	describe('concept art / concept_art_generation', () => {
		it('cancel refunds and fails the job even though fal refused the cancel', async () => {
			await cancelConceptArt();
			const row = await conceptRow();
			expect({
				status: row.status,
				errorMessage: row.errorMessage,
				balance: await balance(),
			}).toEqual({
				status: 'failed',
				errorMessage: 'Cancelled by user',
				balance: TOKEN_COST,
			});
		});

		it("I1 keeps a cancelled job 'failed' when a late success webhook lands", async () => {
			await cancelThenLateConceptSuccess();
			expect((await conceptRow()).status).toBe('failed');
		});

		it('I2 never leaves a row both completed and cancellation-flagged', async () => {
			await cancelThenLateConceptSuccess();
			const row = await conceptRow();
			expect({
				status: row.status,
				errorMessage: row.errorMessage,
			}).not.toEqual({
				status: 'completed',
				errorMessage: 'Cancelled by user',
			});
		});

		it('I3 does not deliver the image to a user who was already refunded', async () => {
			await cancelThenLateConceptSuccess();
			const row = await conceptRow();
			expect({
				balance: await balance(),
				deliveredUrl: row.imageUrl,
			}).toEqual({ balance: TOKEN_COST, deliveredUrl: null });
		});
	});
});
