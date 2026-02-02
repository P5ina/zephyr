import { desc, eq, or } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import * as guestAuth from '$lib/server/guest-auth';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	// Load recent spin jobs for logged-in users or guests
	let spinJobs: table.SpinJob[] = [];

	if (locals.user) {
		spinJobs = await db.query.spinJob.findMany({
			where: eq(table.spinJob.userId, locals.user.id),
			orderBy: [desc(table.spinJob.createdAt)],
			limit: 20,
		});
	} else if (locals.guestSession) {
		spinJobs = await db.query.spinJob.findMany({
			where: eq(table.spinJob.guestSessionId, locals.guestSession.id),
			orderBy: [desc(table.spinJob.createdAt)],
			limit: 5,
		});
	}

	// Guest session info
	let guestInfo = null;
	if (!locals.user && locals.guestSession) {
		guestInfo = guestAuth.getGuestSessionInfo(locals.guestSession);
	}

	return {
		user: locals.user,
		guestSession: locals.guestSession,
		guestInfo,
		spinJobs,
	};
};
