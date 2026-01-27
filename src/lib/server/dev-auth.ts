import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

const DEV_USER_EMAIL = 'dev@gensprite.local';

export async function getOrCreateDevUser() {
	// Find existing dev user
	let [user] = await db
		.select()
		.from(table.user)
		.where(eq(table.user.email, DEV_USER_EMAIL));

	// Create if doesn't exist
	if (!user) {
		const userId = nanoid();
		[user] = await db
			.insert(table.user)
			.values({
				id: userId,
				email: DEV_USER_EMAIL,
				username: 'Dev User',
				tokens: 1000,
				bonusTokens: 0,
			})
			.returning();
	}

	// Create session
	const sessionToken = auth.generateSessionToken();
	const session = await auth.createSession(sessionToken, user.id);

	return {
		user: {
			id: user.id,
			email: user.email,
			username: user.username,
			avatarUrl: user.avatarUrl,
			tokens: user.tokens,
			bonusTokens: user.bonusTokens,
			nsfwEnabled: user.nsfwEnabled,
		},
		sessionToken,
		session,
	};
}
