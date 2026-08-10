import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createTestDatabase, type TestDatabase } from './test-harness';
import * as table from './schema';

describe('test harness', () => {
	let ctx: TestDatabase;

	beforeAll(async () => {
		ctx = await createTestDatabase();
	}, 60_000);

	afterAll(async () => {
		await ctx?.close();
	});

	it('applies the real migrations and exposes every table', async () => {
		const rows = await ctx.db.select().from(table.user);
		expect(rows).toEqual([]);
	});

	it('round-trips a user through the real schema', async () => {
		await ctx.db
			.insert(table.user)
			.values({ id: 'u1', email: 'a@example.com' });
		const [row] = await ctx.db.select().from(table.user);
		expect(row.email).toBe('a@example.com');
		// Defaults from the migrations, not from the TS schema
		expect(row.tokens).toBe(50);
		expect(row.bonusTokens).toBe(0);
	});

	it('reset empties tables between tests', async () => {
		await ctx.reset();
		const rows = await ctx.db.select().from(table.user);
		expect(rows).toEqual([]);
	});
});
