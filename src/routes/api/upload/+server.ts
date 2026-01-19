import { error, json } from '@sveltejs/kit';
import { uploadToFalStorage } from '$lib/server/fal';
import type { RequestHandler } from './$types';

const MAX_FILE_SIZE = 200 * 1024 * 1024; // 200MB

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const formData = await request.formData();
	const file = formData.get('file') as File | null;

	if (!file) {
		error(400, 'File is required');
	}

	if (!file.name.endsWith('.safetensors')) {
		error(400, 'Only .safetensors files are allowed');
	}

	if (file.size > MAX_FILE_SIZE) {
		error(400, 'File size must be 200MB or less');
	}

	const url = await uploadToFalStorage(file);

	return json({ url });
};
