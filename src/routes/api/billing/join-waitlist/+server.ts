import { json } from '@sveltejs/kit';
import { addToWaitlist } from '$lib/server/email';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ locals }) => {
	if (!locals.user) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		await addToWaitlist(locals.user.email, locals.user.username || undefined);
		return json({ success: true });
	} catch (err: any) {
		console.error('Failed to add to waitlist:', err);
		return json({ error: err?.message || 'Failed to join waitlist' }, { status: 500 });
	}
};
