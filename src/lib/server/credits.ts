import { type SQL, sql } from 'drizzle-orm';
import type { PgTable } from 'drizzle-orm/pg-core';
import { db } from '$lib/server/db';

/**
 * Atomic credit operations.
 *
 * The driver is neon-http, which has no session and therefore no interactive
 * transaction: `db.transaction()` throws. That is not a problem here, because
 * a single statement is atomic in Postgres on its own. Every operation below
 * is one statement, and the state transition — not a value read beforehand —
 * is what gates the credit.
 *
 * Why that removes the race: under READ COMMITTED a second concurrent UPDATE
 * of the same row blocks on the row lock, and once it is released re-evaluates
 * its WHERE against the *updated* row. The loser matches nothing, its CTE is
 * empty, and the dependent UPDATE of the balance never runs. Refunding twice
 * is not unlikely, it is unrepresentable.
 *
 * Precondition: every job table names these columns identically —
 * id, user_id, status, token_cost, bonus_token_cost, error_message. That holds
 * for all seven today and is covered by cancel-refund-invariants.spec.ts, which
 * drives each endpoint end to end; a table that drifts will fail there.
 */

export interface RefundClaim {
	/** Null for guest-owned jobs, which hold no balance to credit. */
	userId: string | null;
	tokenCost: number;
	bonusTokenCost: number;
	/** The non-bonus part, i.e. what goes back to `user.tokens`. */
	regularTokens: number;
}

/**
 * Marks a job failed and credits its cost back, in one statement.
 *
 * Returns null when the job was not claimable — already terminal, or never
 * matching `claimableWhen`. A null result means nothing was written and
 * nothing was credited, so the caller should reject rather than refund.
 */
export async function claimJobAndRefund(params: {
	job: PgTable;
	jobId: string;
	errorMessage: string;
	/** Extra predicate on the job row, e.g. sql`status in ('pending','processing')`. */
	claimableWhen: SQL;
}): Promise<RefundClaim | null> {
	const { job, jobId, errorMessage, claimableWhen } = params;

	const result = await db.execute(sql`
		WITH claimed AS (
			UPDATE ${job}
			   SET status = 'failed',
			       error_message = ${errorMessage}
			 WHERE id = ${jobId}
			   AND (${claimableWhen})
			RETURNING user_id, token_cost, bonus_token_cost
		), credited AS (
			UPDATE "user" u
			   SET tokens       = u.tokens       + (c.token_cost - c.bonus_token_cost),
			       bonus_tokens = u.bonus_tokens + c.bonus_token_cost
			  FROM claimed c
			 WHERE u.id = c.user_id
			RETURNING u.id
		)
		SELECT user_id, token_cost, bonus_token_cost FROM claimed
	`);

	const row = result.rows[0] as
		| { user_id: string | null; token_cost: number; bonus_token_cost: number }
		| undefined;
	if (!row) return null;

	const tokenCost = Number(row.token_cost);
	const bonusTokenCost = Number(row.bonus_token_cost);

	return {
		userId: row.user_id,
		tokenCost,
		bonusTokenCost,
		regularTokens: tokenCost - bonusTokenCost,
	};
}
