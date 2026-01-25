import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import * as auth from '$lib/server/auth';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';

const PREVIEW_USER_EMAIL = 'preview@gensprite.local';

export async function getOrCreatePreviewUser() {
	// Find existing preview user
	let [user] = await db
		.select()
		.from(table.user)
		.where(eq(table.user.email, PREVIEW_USER_EMAIL));

	// Create if doesn't exist
	if (!user) {
		const userId = nanoid();
		[user] = await db
			.insert(table.user)
			.values({
				id: userId,
				email: PREVIEW_USER_EMAIL,
				username: 'Preview User',
				tokens: 100,
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
