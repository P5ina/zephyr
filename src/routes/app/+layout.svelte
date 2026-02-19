<script lang="ts">
import { Coins, Layers, Lock, Menu, Palette, Rotate3d, RotateCw, Sparkles, X } from 'lucide-svelte';
import type { Snippet } from 'svelte';
import { page } from '$app/state';
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

let mobileMenuOpen = $state(false);

const guestGenerationsRemaining = $derived(
	GUEST_CONFIG.maxGenerations - tokenState.guestGenerationsUsed
);

const tabs = [
	{ href: '/app/rotate', label: '8-Dir Rotation', icon: RotateCw, guestAllowed: true },
	{ href: '/app', label: 'Generate Sprite', icon: Sparkles, guestAllowed: true },
	{ href: '/app/textures', label: 'Textures', icon: Layers, guestAllowed: false },
	{ href: '/app/concept-art', label: 'Concept Art', icon: Palette, guestAllowed: false },
	{ href: '/app/rotate-new', label: 'Rotate 4', icon: Rotate3d, guestAllowed: false },
];

function isActive(href: string) {
	if (href === '/app') {
		return page.url.pathname === '/app';
	}
	return page.url.pathname === href || page.url.pathname.startsWith(href + '/');
}

function toggleMobileMenu() {
	mobileMenuOpen = !mobileMenuOpen;
}

function closeMobileMenu() {
	mobileMenuOpen = false;
}
</script>

<div class="app-shell">
	<header class="app-header">
		<div class="header-inner">
			<div class="flex items-center gap-6">
				<a href="/" class="app-logo">GenSprite</a>
				<nav class="hidden md:flex items-center gap-1">
					{#each tabs as tab}
						{#if data.isGuest && !tab.guestAllowed}
							<span class="nav-tab nav-tab-locked" title="Sign up to unlock">
								<tab.icon class="w-4 h-4" />
								{tab.label}
								<Lock class="w-3 h-3 opacity-50" />
							</span>
						{:else}
							<a
								href={tab.href}
								class="nav-tab {isActive(tab.href) ? 'nav-tab-active' : 'nav-tab-idle'}"
							>
								<tab.icon class="w-4 h-4" />
								{tab.label}
							</a>
						{/if}
					{/each}
				</nav>
			</div>

			<div class="hidden md:flex items-center gap-3">
				{#if data.isGuest}
					<div class="token-badge" title="Free generations remaining">
						<Sparkles class="w-4 h-4 text-amber-400" />
						<span>{guestGenerationsRemaining} free</span>
					</div>
					<a href="/login" class="btn-cta">Sign up</a>
				{:else if data.user}
					<a href="/app/billing" class="token-badge token-badge-link" title="Tokens available">
						<Coins class="w-4 h-4 text-amber-400" />
						<span>{tokenState.total}</span>
					</a>
					{#if data.user.avatarUrl}
						<img
							src={data.user.avatarUrl}
							alt={data.user.username || data.user.email}
							class="w-8 h-8 rounded-full ring-1 ring-zinc-700"
						/>
					{/if}
					<span class="text-sm text-zinc-400">{data.user.username || data.user.email}</span>
					<a href="/logout" class="sign-out">Sign out</a>
				{/if}
			</div>

			<div class="flex md:hidden items-center gap-3">
				{#if data.isGuest}
					<div class="token-badge" title="Free generations remaining">
						<Sparkles class="w-4 h-4 text-amber-400" />
						<span>{guestGenerationsRemaining}</span>
					</div>
				{:else if data.user}
					<a href="/app/billing" class="token-badge token-badge-link" title="Tokens available">
						<Coins class="w-4 h-4 text-amber-400" />
						<span>{tokenState.total}</span>
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

		{#if mobileMenuOpen}
			<div class="mobile-menu">
				<div class="max-w-7xl mx-auto px-4 py-3 flex flex-col gap-1">
					{#each tabs as tab}
						{#if data.isGuest && !tab.guestAllowed}
							<span class="mobile-tab mobile-tab-locked" title="Sign up to unlock">
								<tab.icon class="w-4 h-4" />
								{tab.label}
								<Lock class="w-3 h-3 opacity-50" />
							</span>
						{:else}
							<a
								href={tab.href}
								onclick={closeMobileMenu}
								class="mobile-tab {isActive(tab.href) ? 'mobile-tab-active' : 'mobile-tab-idle'}"
							>
								<tab.icon class="w-4 h-4" />
								{tab.label}
							</a>
						{/if}
					{/each}

					<div class="my-2 border-t border-zinc-800/60"></div>

					{#if data.isGuest}
						<a
							href="/login"
							onclick={closeMobileMenu}
							class="btn-cta text-center"
						>
							Sign up
						</a>
					{:else if data.user}
						<div class="flex items-center gap-3 px-4 py-2">
							{#if data.user.avatarUrl}
								<img
									src={data.user.avatarUrl}
									alt={data.user.username || data.user.email}
									class="w-8 h-8 rounded-full ring-1 ring-zinc-700"
								/>
							{/if}
							<span class="text-sm text-zinc-400">{data.user.username || data.user.email}</span>
						</div>
						<a
							href="/logout"
							onclick={closeMobileMenu}
							class="mobile-tab mobile-tab-idle"
						>
							Sign out
						</a>
					{/if}
				</div>
			</div>
		{/if}
	</header>

	<main class="app-main">
		{@render children()}
	</main>
</div>

<style>
	.app-shell { min-height: 100vh; }

	/* Sticky glass header */
	.app-header {
		position: sticky; top: 0; z-index: 40;
		border-bottom: 1px solid rgba(63,63,70,.3);
		background: rgba(9,9,11,.85);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.header-inner {
		max-width: 80rem; margin: 0 auto;
		padding: .85rem 1rem;
		display: flex; align-items: center; justify-content: space-between;
	}

	/* Logo */
	.app-logo {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800; font-size: 1.2rem;
		color: #fff; text-decoration: none;
		transition: color .2s;
	}
	.app-logo:hover { color: #fbbf24; }

	/* Desktop nav tabs */
	.nav-tab {
		display: flex; align-items: center; gap: .45rem;
		padding: .4rem .85rem; border-radius: .55rem;
		font-size: .8125rem; font-weight: 500;
		text-decoration: none; transition: all .2s;
	}
	.nav-tab-idle {
		color: #a1a1aa;
	}
	.nav-tab-idle:hover {
		color: #fff; background: rgba(63,63,70,.3);
	}
	.nav-tab-active {
		color: #fbbf24;
		background: rgba(245,158,11,.08);
		box-shadow: inset 0 0 0 1px rgba(245,158,11,.2);
	}
	.nav-tab-locked {
		color: rgba(113,113,122,.6); cursor: not-allowed;
	}

	/* Token badge */
	.token-badge {
		display: flex; align-items: center; gap: .4rem;
		padding: .3rem .7rem; border-radius: .5rem;
		background: rgba(63,63,70,.25);
		border: 1px solid rgba(63,63,70,.3);
		font-size: .8125rem; font-weight: 600; color: #fff;
	}
	.token-badge-link {
		text-decoration: none;
		transition: background .2s, border-color .2s;
	}
	.token-badge-link:hover {
		background: rgba(63,63,70,.4);
		border-color: rgba(63,63,70,.5);
	}

	/* CTA button */
	.btn-cta {
		display: inline-block;
		padding: .4rem 1rem; border-radius: .55rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-size: .8125rem; font-weight: 600;
		text-decoration: none;
		box-shadow: 0 0 16px rgba(245,158,11,.15);
		transition: box-shadow .2s, transform .15s;
	}
	.btn-cta:hover {
		box-shadow: 0 0 24px rgba(245,158,11,.28);
		transform: translateY(-1px);
	}

	.sign-out {
		font-size: .8125rem; color: #52525b;
		text-decoration: none; transition: color .2s;
	}
	.sign-out:hover { color: #fff; }

	/* Mobile menu */
	.mobile-menu {
		border-top: 1px solid rgba(63,63,70,.25);
		background: rgba(9,9,11,.95);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.mobile-tab {
		display: flex; align-items: center; gap: .5rem;
		padding: .65rem 1rem; border-radius: .55rem;
		font-size: .875rem; font-weight: 500;
		text-decoration: none; transition: all .2s;
	}
	.mobile-tab-idle { color: #a1a1aa; }
	.mobile-tab-idle:hover { color: #fff; background: rgba(63,63,70,.25); }
	.mobile-tab-active {
		color: #fbbf24;
		background: rgba(245,158,11,.08);
		box-shadow: inset 0 0 0 1px rgba(245,158,11,.2);
	}
	.mobile-tab-locked {
		color: rgba(113,113,122,.5); cursor: not-allowed;
	}

	/* Main content area */
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
