/**
 * In-process Postgres for integration tests.
 *
 * PGlite runs the real Postgres engine in WASM, so the real drizzle migrations
 * apply and the real SQL executes — no Docker, no network, no shared state
 * between test files.
 *
 * One caveat worth stating plainly: PGlite serialises queries. It cannot
 * reproduce a true simultaneous race between two HTTP requests. Tests that
 * assert concurrency invariants must therefore express them deterministically
 * — "run the claim twice, the second must come back empty" — rather than by
 * firing N parallel requests and hoping the interleaving shows up. A parallel
 * test here would pass whether or not the bug exists, which is worse than no
 * test at all.
 */
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/pglite';
import * as schema from './schema';

const MIGRATIONS_DIR = path.resolve('drizzle');

interface JournalEntry {
	idx: number;
	tag: string;
}

/**
 * Applies the migrations in journal order using PGlite's `exec`, which accepts
 * multi-statement scripts.
 *
 * drizzle's own migrator sends each file as a prepared statement, and Postgres
 * rejects those when a file holds more than one command. Several migrations
 * here were hand-written without drizzle's `--> statement-breakpoint` markers,
 * so the migrator cannot split them. Adding the markers would change the file
 * bytes, and drizzle keys applied migrations by content hash — production
 * would then see them as new. Applying the raw SQL leaves those files alone.
 */
async function applyMigrations(client: PGlite): Promise<void> {
	const journalRaw = await readFile(
		path.join(MIGRATIONS_DIR, 'meta', '_journal.json'),
		'utf8',
	);
	const journal: { entries: JournalEntry[] } = JSON.parse(journalRaw);
	const ordered = [...journal.entries].sort((a, b) => a.idx - b.idx);

	for (const entry of ordered) {
		const file = path.join(MIGRATIONS_DIR, `${entry.tag}.sql`);
		const ddl = await readFile(file, 'utf8');
		try {
			await client.exec(ddl);
		} catch (cause) {
			throw new Error(`migration ${entry.tag} failed: ${cause}`, { cause });
		}
	}
}

export type TestDb = ReturnType<typeof drizzle<typeof schema>>;

export interface TestDatabase {
	db: TestDb;
	/** Empties every table without re-running migrations. */
	reset: () => Promise<void>;
	close: () => Promise<void>;
}

export async function createTestDatabase(): Promise<TestDatabase> {
	const client = new PGlite();
	const db = drizzle(client, { schema });

	await applyMigrations(client);

	// Collected once, after migration, so reset() does not re-read the catalog
	// on every test.
	const { rows } = await client.query<{ tablename: string }>(
		`SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '__drizzle_migrations'`,
	);
	const tables = rows.map((r) => `"${r.tablename}"`).join(', ');

	return {
		db,
		reset: async () => {
			if (!tables) return;
			await db.execute(sql.raw(`TRUNCATE ${tables} RESTART IDENTITY CASCADE`));
		},
		close: () => client.close(),
	};
}
