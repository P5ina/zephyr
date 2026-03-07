import { env } from '$env/dynamic/private';

/**
 * Build a webhook URL for fal.ai to call when a job completes.
 * URL format: https://{host}/api/webhooks/fal?secret={secret}&type={type}&jobId={jobId}&extra=...
 */
export function buildFalWebhookUrl(
	type: string,
	jobId: string,
	extra?: Record<string, string>,
): string | undefined {
	const secret = env.FAL_WEBHOOK_SECRET;
	if (!secret) return undefined; // Gracefully fall back to polling if no secret configured

	// Use APP_URL if set, otherwise construct from VERCEL_URL, fallback to production
	const host =
		env.APP_URL || (env.VERCEL_URL ? `https://${env.VERCEL_URL}` : 'https://gensprite.ai');

	const params = new URLSearchParams({ secret, type, jobId, ...extra });
	return `${host}/api/webhooks/fal?${params.toString()}`;
}
