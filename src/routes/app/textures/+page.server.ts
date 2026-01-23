import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	// User is loaded in +layout.server.ts
	return {};
};
