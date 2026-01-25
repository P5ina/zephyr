<script lang="ts">
import { page } from '$app/state';
import {
	Coins,
	Layers,
	RotateCw,
	Sparkles,
} from 'lucide-svelte';
import type { LayoutData } from './$types';

let { data, children }: { data: LayoutData; children: any } = $props();

// Capture initial values for local state management
// svelte-ignore state_referenced_locally
const initialUser = data.user;

let tokens = $state(initialUser.tokens);
let bonusTokens = $state(initialUser.bonusTokens);

const tabs = [
	{ href: '/app', label: 'Sprites', icon: Sparkles },
	{ href: '/app/textures', label: 'Textures', icon: Layers },
	{ href: '/app/rotate', label: 'Rotate', icon: RotateCw },
];

function isActive(href: string) {
	if (href === '/app') {
		return page.url.pathname === '/app';
	}
	return page.url.pathname.startsWith(href);
}
</script>

<div class="min-h-screen bg-zinc-950">
	<header class="border-b border-zinc-800">
		<div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
			<div class="flex items-center gap-6">
				<a href="/" class="text-xl font-bold text-white hover:text-yellow-400 transition-colors">GenSprite</a>
				<nav class="flex items-center gap-1">
					{#each tabs as tab}
						<a
							href={tab.href}
							class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors {isActive(tab.href)
								? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
								: 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
						>
							<tab.icon class="w-4 h-4" />
							{tab.label}
						</a>
					{/each}
				</nav>
			</div>
			<div class="flex items-center gap-4">
				<a
					href="/app/billing"
					class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
					title="Tokens available"
				>
					<Coins class="w-4 h-4 text-yellow-500" />
					<span class="text-sm font-medium text-white">{tokens + bonusTokens}</span>
				</a>
				{#if data.user.avatarUrl}
					<img
						src={data.user.avatarUrl}
						alt={data.user.username || data.user.email}
						class="w-8 h-8 rounded-full"
					/>
				{/if}
				<span class="text-sm text-zinc-300">{data.user.username || data.user.email}</span>
				<a href="/logout" class="text-sm text-zinc-500 hover:text-white transition-colors">
					Sign out
				</a>
			</div>
		</div>
	</header>

	<main class="max-w-7xl mx-auto px-4 py-8">
		{@render children()}
	</main>
</div>
