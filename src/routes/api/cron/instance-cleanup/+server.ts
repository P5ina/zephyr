import { json } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { destroyIdleInstances, cleanupFailedInstances } from '$lib/server/instance-manager';
import type { RequestHandler } from './$types';

// Vercel Cron uses CRON_SECRET to authenticate cron requests
const CRON_SECRET = env.CRON_SECRET;

export const GET: RequestHandler = async ({ request }) => {
	// Verify cron secret (Vercel sends this header for cron jobs)
	const authHeader = request.headers.get('authorization');
	if (CRON_SECRET && authHeader !== `Bearer ${CRON_SECRET}`) {
		return json({ error: 'Unauthorized' }, { status: 401 });
	}

	try {
		const [idleDestroyed, failedCleaned] = await Promise.all([
			destroyIdleInstances(),
			cleanupFailedInstances(),
		]);

		return json({
			success: true,
			idleInstancesDestroyed: idleDestroyed,
			failedInstancesCleaned: failedCleaned,
			timestamp: new Date().toISOString(),
		});
	} catch (err) {
		console.error('Instance cleanup failed:', err);
		return json(
			{
				success: false,
				error: err instanceof Error ? err.message : 'Unknown error',
			},
			{ status: 500 },
		);
	}
};
