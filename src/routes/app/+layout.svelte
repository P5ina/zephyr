<script lang="ts">
import { Coins, Layers, Lock, Menu, Rotate3d, RotateCw, Sparkles, X } from 'lucide-svelte';
import type { Snippet } from 'svelte';
import { page } from '$app/state';
import { GUEST_CONFIG } from '$lib/guest-config';
import type { LayoutData } from './$types';

let { data, children }: { data: LayoutData; children: Snippet } = $props();

// Capture initial values for local state management
// svelte-ignore state_referenced_locally
const initialUser = data.user;
// svelte-ignore state_referenced_locally
const initialGuestSession = data.guestSession;

let tokens = $state(initialUser?.tokens ?? 0);
let bonusTokens = $state(initialUser?.bonusTokens ?? 0);
let guestGenerationsUsed = $state(initialGuestSession?.generationsUsed ?? 0);
let mobileMenuOpen = $state(false);

const guestGenerationsRemaining = $derived(
	GUEST_CONFIG.maxGenerations - guestGenerationsUsed
);

const tabs = [
	{ href: '/app', label: 'Sprites', icon: Sparkles, guestAllowed: true },
	{ href: '/app/textures', label: 'Textures', icon: Layers, guestAllowed: false },
	{ href: '/app/rotate', label: 'Rotate 8', icon: RotateCw, guestAllowed: false },
	{ href: '/app/rotate-new', label: 'Rotate 4', icon: Rotate3d, guestAllowed: false },
];

function isActive(href: string) {
	if (href === '/app') {
		return page.url.pathname === '/app';
	}
	// Exact match or followed by a slash (for nested routes)
	return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
}

function toggleMobileMenu() {
	mobileMenuOpen = !mobileMenuOpen;
}

function closeMobileMenu() {
	mobileMenuOpen = false;
}
</script>

<div class="min-h-screen bg-zinc-950">
	<header class="border-b border-zinc-800">
		<div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
			<!-- Logo and desktop nav -->
			<div class="flex items-center gap-6">
				<a href="/" class="text-xl font-bold text-white hover:text-yellow-400 transition-colors">GenSprite</a>
				<!-- Desktop navigation -->
				<nav class="hidden md:flex items-center gap-1">
					{#each tabs as tab}
						{#if data.isGuest && !tab.guestAllowed}
							<span
								class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-zinc-600 cursor-not-allowed"
								title="Sign up to unlock"
							>
								<tab.icon class="w-4 h-4" />
								{tab.label}
								<Lock class="w-3 h-3" />
							</span>
						{:else}
							<a
								href={tab.href}
								class="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors {isActive(tab.href)
									? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
									: 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
							>
								<tab.icon class="w-4 h-4" />
								{tab.label}
							</a>
						{/if}
					{/each}
				</nav>
			</div>

			<!-- Desktop user section -->
			<div class="hidden md:flex items-center gap-4">
				{#if data.isGuest}
					<div
						class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg"
						title="Free generations remaining"
					>
						<Sparkles class="w-4 h-4 text-yellow-500" />
						<span class="text-sm font-medium text-white">{guestGenerationsRemaining} free</span>
					</div>
					<a
						href="/login"
						class="px-4 py-1.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors"
					>
						Sign up
					</a>
				{:else if data.user}
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
				{/if}
			</div>

			<!-- Mobile: tokens/free + menu button -->
			<div class="flex md:hidden items-center gap-3">
				{#if data.isGuest}
					<div
						class="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 rounded-lg"
						title="Free generations remaining"
					>
						<Sparkles class="w-4 h-4 text-yellow-500" />
						<span class="text-sm font-medium text-white">{guestGenerationsRemaining}</span>
					</div>
				{:else if data.user}
					<a
						href="/app/billing"
						class="flex items-center gap-1.5 px-2 py-1 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
						title="Tokens available"
					>
						<Coins class="w-4 h-4 text-yellow-500" />
						<span class="text-sm font-medium text-white">{tokens + bonusTokens}</span>
					</a>
				{/if}
				<button
					onclick={toggleMobileMenu}
					class="p-2 text-zinc-400 hover:text-white transition-colors"
					aria-label="Toggle menu"
				>
					{#if mobileMenuOpen}
						<X class="w-5 h-5" />
					{:else}
						<Menu class="w-5 h-5" />
					{/if}
				</button>
			</div>
		</div>

		<!-- Mobile menu -->
		{#if mobileMenuOpen}
			<div class="md:hidden border-t border-zinc-800 bg-zinc-900/95 backdrop-blur-sm">
				<div class="max-w-7xl mx-auto px-4 py-4 flex flex-col gap-2">
					<!-- Navigation tabs -->
					{#each tabs as tab}
						{#if data.isGuest && !tab.guestAllowed}
							<span
								class="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium text-zinc-600 cursor-not-allowed"
								title="Sign up to unlock"
							>
								<tab.icon class="w-4 h-4" />
								{tab.label}
								<Lock class="w-3 h-3" />
							</span>
						{:else}
							<a
								href={tab.href}
								onclick={closeMobileMenu}
								class="flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium transition-colors {isActive(tab.href)
									? 'bg-yellow-500/10 text-yellow-400 border border-yellow-500/30'
									: 'text-zinc-400 hover:text-white hover:bg-zinc-800'}"
							>
								<tab.icon class="w-4 h-4" />
								{tab.label}
							</a>
						{/if}
					{/each}

					<!-- Divider -->
					<div class="border-t border-zinc-800 my-2"></div>

					<!-- User section -->
					{#if data.isGuest}
						<a
							href="/login"
							onclick={closeMobileMenu}
							class="px-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-semibold rounded-lg text-sm transition-colors text-center"
						>
							Sign up
						</a>
					{:else if data.user}
						<div class="flex items-center gap-3 px-4 py-2">
							{#if data.user.avatarUrl}
								<img
									src={data.user.avatarUrl}
									alt={data.user.username || data.user.email}
									class="w-8 h-8 rounded-full"
								/>
							{/if}
							<span class="text-sm text-zinc-300">{data.user.username || data.user.email}</span>
						</div>
						<a
							href="/logout"
							onclick={closeMobileMenu}
							class="px-4 py-3 text-sm text-zinc-400 hover:text-white hover:bg-zinc-800 rounded-lg transition-colors"
						>
							Sign out
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</header>

	<main class="max-w-7xl mx-auto px-4 py-8">
		{@render children()}
	</main>
</div>
