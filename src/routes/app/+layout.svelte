<script lang="ts">
import {
	Coins,
	Film,
	Layers,
	Palette,
	Rotate3d,
	RotateCw,
	Sparkles,
} from 'lucide-svelte';
import type { Snippet } from 'svelte';
import Header from '$lib/components/Header.svelte';
import { GUEST_CONFIG } from '$lib/guest-config';
import { tokenState } from '$lib/token-state.svelte';
import type { LayoutData } from './$types';

let { data, children }: { data: LayoutData; children: Snippet } = $props();

// Initialize shared token state from server data
tokenState.init(
	data.user?.tokens ?? 0,
	data.user?.bonusTokens ?? 0,
	data.guestSession?.generationsUsed ?? 0,
);

const guestGenerationsRemaining = $derived(
	GUEST_CONFIG.maxGenerations - tokenState.guestGenerationsUsed,
);

const tabs = [
	{
		href: '/app/rotate',
		label: '8-Dir Rotation',
		icon: RotateCw,
		guestAllowed: true,
	},
	{
		href: '/app',
		label: 'Generate Sprite',
		icon: Sparkles,
		guestAllowed: true,
	},
	{
		href: '/app/textures',
		label: 'Textures',
		icon: Layers,
		guestAllowed: false,
	},
	{
		href: '/app/concept-art',
		label: 'Concept Art',
		icon: Palette,
		guestAllowed: false,
	},
	{
		href: '/app/rotate-new',
		label: 'Rotate 4',
		icon: Rotate3d,
		guestAllowed: true,
	},
	{ href: '/app/animate', label: 'Animate', icon: Film, guestAllowed: false },
];
</script>

<div class="app-shell">
	<Header
		variant="app"
		user={data.user}
		isGuest={data.isGuest}
		{guestGenerationsRemaining}
		tokenTotal={tokenState.total}
		{tabs}
	/>

	<main class="app-main">
		{@render children()}
	</main>
</div>

<style>
	.app-shell { min-height: 100vh; }

	.app-main {
		max-width: 80rem; margin: 0 auto;
		padding: 1.5rem 1rem;
	}

	/* Global heading typography for all child pages */
	.app-main :global(h1),
	.app-main :global(h2),
	.app-main :global(h3) {
		font-family: 'Syne', system-ui, sans-serif;
	}
</style>
