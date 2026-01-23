import { error, json } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import { db } from '$lib/server/db';
import * as table from '$lib/server/db/schema';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.user) {
		error(401, 'Unauthorized');
	}

	const texture = await db.query.textureGeneration.findFirst({
		where: and(
			eq(table.textureGeneration.id, params.id),
			eq(table.textureGeneration.userId, locals.user.id),
		),
	});

	if (!texture) {
		error(404, 'Texture not found');
	}

	const response: Record<string, unknown> = {
		id: texture.id,
		status: texture.status,
	};

	if (texture.status === 'pending') {
		response.statusMessage = texture.currentStage || 'Queued for processing...';
		response.progress = 0;
	}

	if (texture.status === 'processing') {
		response.progress = texture.progress;
		response.statusMessage = texture.currentStage || 'Processing...';
	}

	if (texture.status === 'completed') {
		response.progress = 100;
		response.textures = {
			basecolor: texture.basecolorUrl,
			normal: texture.normalUrl,
			roughness: texture.roughnessUrl,
			metallic: texture.metallicUrl,
			height: texture.heightUrl,
		};
	}

	if (texture.status === 'failed') {
		response.error = texture.errorMessage;
	}

	return json(response);
};
