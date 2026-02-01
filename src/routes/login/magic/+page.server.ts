import { fail, redirect } from '@sveltejs/kit';
import { and, eq, gt, sql } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import { sendMagicLinkEmail } from '$lib/server/email';
import { createMagicLink } from '$lib/server/magic-link';
import type { Actions, PageServerLoad } from './$types';

const RATE_LIMIT_EMAIL = 3;
const RATE_LIMIT_EMAIL_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.user) {
		redirect(302, '/app');
	}
	return {};
};

export const actions: Actions = {
	default: async ({ request, getClientAddress }) => {
		const formData = await request.formData();
		const email = formData.get('email');

		if (!email || typeof email !== 'string') {
			return fail(400, { error: 'Email is required' });
		}

		const normalizedEmail = email.toLowerCase().trim();

		// Basic email validation
		if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
			return fail(400, { error: 'Invalid email address' });
		}

		// Rate limit by email
		const recentByEmail = await db
			.select({ count: sql<number>`count(*)` })
			.from(table.magicLinkToken)
			.where(
				and(
					eq(table.magicLinkToken.email, normalizedEmail),
					gt(
						table.magicLinkToken.createdAt,
						new Date(Date.now() - RATE_LIMIT_EMAIL_WINDOW_MS),
					),
				),
			);

		if (recentByEmail[0] && recentByEmail[0].count >= RATE_LIMIT_EMAIL) {
			return fail(429, { error: 'Too many requests. Please try again later.' });
		}

		try {
			const magicLinkUrl = await createMagicLink(normalizedEmail);
			await sendMagicLinkEmail(normalizedEmail, magicLinkUrl);
			return { success: true, email: normalizedEmail };
		} catch (e) {
			console.error('Failed to send magic link:', e);
			return fail(500, { error: 'Failed to send email. Please try again.' });
		}
	},
};
