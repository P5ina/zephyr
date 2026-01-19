import { handleUpload, type HandleUploadBody } from '@vercel/blob/client';
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const body = (await request.json()) as HandleUploadBody;

	try {
		const response = await handleUpload({
			body,
			request,
			onBeforeGenerateToken: async (pathname) => {
				// Validate file extension
				if (!pathname.toLowerCase().endsWith('.safetensors')) {
					throw new Error('Only .safetensors files are allowed');
				}

				return {
					allowedContentTypes: ['application/octet-stream'],
					maximumSizeInBytes: 500 * 1024 * 1024, // 500MB
					tokenPayload: JSON.stringify({
						userId: locals.user!.id,
					}),
				};
			},
			onUploadCompleted: async ({ blob, tokenPayload }) => {
				// This is called after upload completes
				// We could create the LoRA entry here, but we'll do it separately
				console.log('Upload completed:', blob.url);
			},
		});

		return json(response);
	} catch (e) {
		const message = e instanceof Error ? e.message : 'Upload failed';
		error(400, message);
	}
};
