import { upload } from '@vercel/blob/client';
import { nanoid } from 'nanoid';

const EXTENSIONS: Record<string, string> = {
	'image/png': 'png',
	'image/jpeg': 'jpg',
	'image/webp': 'webp',
};

/**
 * Uploads an image File directly from the browser to Vercel Blob, bypassing the
 * serverless function request-body limit (4.5MB). Returns the public blob URL.
 *
 * Auth, content-type and size are enforced server-side in /api/blob/upload.
 */
export async function uploadImageToBlob(
	file: File,
	prefix: string,
): Promise<string> {
	const ext = EXTENSIONS[file.type] ?? 'png';
	const result = await upload(`${prefix}/${nanoid()}.${ext}`, file, {
		access: 'public',
		handleUploadUrl: '/api/blob/upload',
		contentType: file.type,
	});
	return result.url;
}
