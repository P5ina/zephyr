import { error, json } from '@sveltejs/kit';
import { type HandleUploadBody, handleUpload } from '@vercel/blob/client';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

const ALLOWED_CONTENT_TYPES = ['image/png', 'image/jpeg', 'image/webp'];
const MAX_SIZE_BYTES = 10 * 1024 * 1024;

// Generates short-lived client upload tokens so the browser can upload images
// straight to Vercel Blob, instead of streaming the bytes through the function
// (which is capped at 4.5MB and caused FUNCTION_PAYLOAD_TOO_LARGE on animations).
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!env.BLOB_READ_WRITE_TOKEN) {
		error(500, 'Image upload not configured');
	}

	const body = (await request.json()) as HandleUploadBody;

	try {
		const result = await handleUpload({
			body,
			request,
			token: env.BLOB_READ_WRITE_TOKEN,
			onBeforeGenerateToken: async () => {
				// Only signed-in users may request an upload token.
				if (!locals.user) {
					throw new Error('Sign in to upload images');
				}
				return {
					allowedContentTypes: ALLOWED_CONTENT_TYPES,
					maximumSizeInBytes: MAX_SIZE_BYTES,
					addRandomSuffix: true,
				};
			},
			onUploadCompleted: async () => {
				// Direct browser→Blob upload; the generate endpoints persist the URL.
				// (This callback only fires when the app is reachable by Vercel Blob,
				// i.e. not on localhost.)
			},
		});
		return json(result);
	} catch (err) {
		error(400, err instanceof Error ? err.message : 'Upload failed');
	}
};
