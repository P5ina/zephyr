<script lang="ts">
	import { Coins, Lock, Menu, Sparkles, X } from 'lucide-svelte';
	import { page } from '$app/state';
	import logo from '$lib/assets/favicon.png';

	interface Tab {
		href: string;
		label: string;
		icon: typeof Sparkles;
		guestAllowed: boolean;
	}

	interface Props {
		variant?: 'landing' | 'app' | 'simple';
		user?: {
			id: string;
			email?: string;
			username?: string | null;
			avatarUrl?: string | null;
		} | null;
		// App variant
		isGuest?: boolean;
		guestGenerationsRemaining?: number;
		tokenTotal?: number;
		tabs?: Tab[];
		// Simple / Landing variant
		showBack?: boolean;
		showAuth?: boolean;
		ctaText?: string;
		ctaHref?: string;
	}

	let {
		variant = 'landing',
		user = null,
		isGuest = false,
		guestGenerationsRemaining = 0,
		tokenTotal = 0,
		tabs = [],
		showBack = false,
		showAuth = true,
		ctaText,
		ctaHref,
	}: Props = $props();

	let mobileMenuOpen = $state(false);

	const landingLinks = [
		{ href: '/app/rotate', label: '8-Dir Rotation', accent: true },
		{ href: '/#features', label: 'Features', accent: false },
		{ href: '/pricing', label: 'Pricing', accent: false },
		{ href: '/docs', label: 'API', accent: false },
	];

	function isActive(href: string) {
		if (href === '/app') return page.url.pathname === '/app';
		return (
			page.url.pathname === href || page.url.pathname.startsWith(`${href}/`)
		);
	}

	function toggleMobileMenu() {
		mobileMenuOpen = !mobileMenuOpen;
	}

	function closeMobileMenu() {
		mobileMenuOpen = false;
	}
</script>

<header class="hdr">
	<div class="hdr-inner">
		<!-- Left: Logo + Nav -->
		<div class="hdr-left">
			{#if showBack && variant === 'simple'}
				<a href="/" class="hdr-back" aria-label="Back to home">
					<svg
						width="18"
						height="18"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						stroke-width="2"
						stroke-linecap="round"
						stroke-linejoin="round"><path d="m15 18-6-6 6-6" /></svg
					>
				</a>
			{/if}

			<a href="/" class="hdr-logo">
				<img src={logo} alt="" class="hdr-logo-img" />
				<span class="hdr-logo-text">GenSprite</span>
			</a>

			<!-- Landing nav links (desktop) -->
			{#if variant === 'landing'}
				<nav class="hdr-nav hdr-desktop">
					{#each landingLinks as link (link.href)}
						<a
							href={link.href}
							class="hdr-link"
							class:hdr-link-accent={link.accent}
						>
							{link.label}
						</a>
					{/each}
				</nav>
			{/if}

			<!-- App tab nav (desktop) -->
			{#if variant === 'app' && tabs.length > 0}
				<nav class="hdr-nav hdr-desktop">
					{#each tabs as tab (tab.href)}
						{#if isGuest && !tab.guestAllowed}
							<span class="hdr-tab hdr-tab-locked" title="Sign up to unlock">
								<tab.icon class="h-4 w-4" />
								<span class="hdr-tab-label">{tab.label}</span>
								<Lock class="h-3 w-3 opacity-40" />
							</span>
						{:else}
							<a
								href={tab.href}
								class="hdr-tab {isActive(tab.href)
									? 'hdr-tab-active'
									: 'hdr-tab-idle'}"
							>
								<tab.icon class="h-4 w-4" />
								<span class="hdr-tab-label">{tab.label}</span>
							</a>
						{/if}
					{/each}
				</nav>
			{/if}
		</div>

		<!-- Right: Auth / Tokens / User -->
		<div class="hdr-right hdr-desktop">
			{#if variant === 'app'}
				<!-- App: token badge + user -->
				{#if isGuest}
					<div class="hdr-badge" title="Free generations remaining">
						<Sparkles class="h-3.5 w-3.5 text-amber-400" />
						<span>{guestGenerationsRemaining} free</span>
					</div>
					<a href="/login" class="hdr-cta">Sign up</a>
				{:else if user}
					<a
						href="/app/billing"
						class="hdr-badge hdr-badge-link"
						title="Tokens available"
					>
						<Coins class="h-3.5 w-3.5 text-amber-400" />
						<span>{tokenTotal}</span>
					</a>
					{#if user.avatarUrl}
						<img src={user.avatarUrl} alt="" class="hdr-avatar" />
					{/if}
					<a href="/dashboard" class="hdr-username"
						>{user.username || user.email}</a
					>
					<a href="/logout" class="hdr-signout">Sign out</a>
				{/if}
			{:else if variant === 'landing'}
				<!-- Landing: auth buttons -->
				{#if user}
					<a href={ctaHref || '/app/rotate'} class="hdr-cta">
						{ctaText || 'Go to App'}
					</a>
				{:else}
					<a href="/login" class="hdr-signin">Sign in</a>
				{/if}
			{:else if variant === 'simple' && showAuth}
				<!-- Simple: optional CTA -->
				{#if user}
					<a href={ctaHref || '/app'} class="hdr-cta">
						{ctaText || 'Open App'}
					</a>
				{:else}
					<a href="/login" class="hdr-signin">Sign in</a>
				{/if}
			{/if}
		</div>

		<!-- Mobile: token + hamburger -->
		<div class="hdr-right hdr-mobile">
			{#if variant === 'app'}
				{#if isGuest}
					<div class="hdr-badge">
						<Sparkles class="h-3.5 w-3.5 text-amber-400" />
						<span>{guestGenerationsRemaining}</span>
					</div>
				{:else if user}
					<a href="/app/billing" class="hdr-badge hdr-badge-link">
						<Coins class="h-3.5 w-3.5 text-amber-400" />
						<span>{tokenTotal}</span>
					</a>
				{/if}
			{/if}
			<button
				onclick={toggleMobileMenu}
				class="hdr-burger"
				aria-label="Toggle menu"
			>
				{#if mobileMenuOpen}
					<X class="h-5 w-5" />
				{:else}
					<Menu class="h-5 w-5" />
				{/if}
			</button>
		</div>
	</div>

	<!-- Mobile dropdown -->
	{#if mobileMenuOpen}
		<div class="mob-menu">
			<div class="mob-inner">
				{#if variant === 'landing'}
					{#each landingLinks as link (link.href)}
						<a
							href={link.href}
							onclick={closeMobileMenu}
							class="mob-link"
							class:mob-link-accent={link.accent}
						>
							{link.label}
						</a>
					{/each}
				{/if}

				{#if variant === 'app' && tabs.length > 0}
					{#each tabs as tab (tab.href)}
						{#if isGuest && !tab.guestAllowed}
							<span class="mob-tab mob-tab-locked" title="Sign up to unlock">
								<tab.icon class="h-4 w-4" />
								{tab.label}
								<Lock class="h-3 w-3 opacity-40" />
							</span>
						{:else}
							<a
								href={tab.href}
								onclick={closeMobileMenu}
								class="mob-tab {isActive(tab.href)
									? 'mob-tab-active'
									: 'mob-tab-idle'}"
							>
								<tab.icon class="h-4 w-4" />
								{tab.label}
							</a>
						{/if}
					{/each}
				{/if}

				<div class="mob-divider"></div>

				{#if variant === 'app'}
					{#if isGuest}
						<a href="/login" onclick={closeMobileMenu} class="hdr-cta mob-cta"
							>Sign up</a
						>
					{:else if user}
						<div class="mob-user">
							{#if user.avatarUrl}
								<img src={user.avatarUrl} alt="" class="hdr-avatar" />
							{/if}
							<a href="/dashboard" class="hdr-username"
								>{user.username || user.email}</a
							>
						</div>
						<a
							href="/logout"
							onclick={closeMobileMenu}
							class="mob-tab mob-tab-idle">Sign out</a
						>
					{/if}
				{:else if variant === 'landing'}
					{#if user}
						<a
							href={ctaHref || '/app/rotate'}
							onclick={closeMobileMenu}
							class="hdr-cta mob-cta"
						>
							{ctaText || 'Go to App'}
						</a>
					{:else}
						<a
							href="/login"
							onclick={closeMobileMenu}
							class="hdr-signin mob-cta">Sign in</a
						>
					{/if}
				{:else if variant === 'simple' && showAuth}
					{#if user}
						<a
							href={ctaHref || '/app'}
							onclick={closeMobileMenu}
							class="hdr-cta mob-cta"
						>
							{ctaText || 'Open App'}
						</a>
					{:else}
						<a
							href="/login"
							onclick={closeMobileMenu}
							class="hdr-signin mob-cta">Sign in</a
						>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</header>

<style>
	/* ===== Core ===== */
	.hdr {
		position: sticky;
		top: 0;
		z-index: 40;
		border-bottom: 1px solid rgba(63, 63, 70, 0.3);
		background: rgba(9, 9, 11, 0.85);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.hdr-inner {
		max-width: 80rem;
		margin: 0 auto;
		padding: 0.7rem 1rem;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	/* Left group */
	.hdr-left {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	/* Back arrow */
	.hdr-back {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2rem;
		height: 2rem;
		border-radius: 0.45rem;
		color: #71717a;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.hdr-back:hover {
		color: #fff;
		background: rgba(63, 63, 70, 0.3);
	}

	/* Logo */
	.hdr-logo {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		text-decoration: none;
		margin-right: 0.75rem;
		transition: opacity 0.2s;
	}
	.hdr-logo:hover {
		opacity: 0.85;
	}
	.hdr-logo-img {
		width: 1.65rem;
		height: 1.65rem;
		border-radius: 0.4rem;
	}
	.hdr-logo-text {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800;
		font-size: 1.1rem;
		color: #fff;
	}

	/* Navigation (desktop) */
	.hdr-nav {
		display: flex;
		align-items: center;
		gap: 0.15rem;
	}

	/* Landing links */
	.hdr-link {
		padding: 0.35rem 0.7rem;
		border-radius: 0.45rem;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #a1a1aa;
		text-decoration: none;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.hdr-link:hover {
		color: #fff;
		background: rgba(63, 63, 70, 0.25);
	}
	.hdr-link-accent {
		color: #fb923c;
	}
	.hdr-link-accent:hover {
		color: #fdba74;
	}

	/* App tabs */
	.hdr-tab {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		padding: 0.35rem 0.7rem;
		border-radius: 0.5rem;
		font-size: 0.8125rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
		white-space: nowrap;
	}
	.hdr-tab-idle {
		color: #a1a1aa;
	}
	.hdr-tab-idle:hover {
		color: #fff;
		background: rgba(63, 63, 70, 0.3);
	}
	.hdr-tab-active {
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.08);
		box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.2);
	}
	.hdr-tab-locked {
		color: rgba(113, 113, 122, 0.55);
		cursor: not-allowed;
	}
	.hdr-tab-label {
		display: none;
	}
	@media (min-width: 1024px) {
		.hdr-tab-label {
			display: inline;
		}
	}

	/* Right group */
	.hdr-right {
		display: flex;
		align-items: center;
		gap: 0.6rem;
	}

	/* Token / generations badge */
	.hdr-badge {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.25rem 0.6rem;
		border-radius: 0.45rem;
		background: rgba(63, 63, 70, 0.25);
		border: 1px solid rgba(63, 63, 70, 0.3);
		font-size: 0.8125rem;
		font-weight: 600;
		color: #fff;
	}
	.hdr-badge-link {
		text-decoration: none;
		transition:
			background 0.2s,
			border-color 0.2s;
	}
	.hdr-badge-link:hover {
		background: rgba(63, 63, 70, 0.4);
		border-color: rgba(63, 63, 70, 0.5);
	}

	/* Primary CTA */
	.hdr-cta {
		display: inline-flex;
		align-items: center;
		padding: 0.4rem 0.95rem;
		border-radius: 0.5rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-size: 0.8125rem;
		font-weight: 600;
		text-decoration: none;
		box-shadow: 0 0 14px rgba(245, 158, 11, 0.12);
		transition:
			box-shadow 0.2s,
			transform 0.15s;
	}
	.hdr-cta:hover {
		box-shadow: 0 0 22px rgba(245, 158, 11, 0.25);
		transform: translateY(-1px);
	}

	/* Sign in (ghost) */
	.hdr-signin {
		display: inline-flex;
		align-items: center;
		padding: 0.4rem 0.95rem;
		border-radius: 0.5rem;
		background: rgba(255, 255, 255, 0.06);
		border: 1px solid rgba(255, 255, 255, 0.08);
		color: #fff;
		font-size: 0.8125rem;
		font-weight: 500;
		text-decoration: none;
		transition:
			background 0.2s,
			border-color 0.2s;
	}
	.hdr-signin:hover {
		background: rgba(255, 255, 255, 0.12);
		border-color: rgba(255, 255, 255, 0.15);
	}

	/* User info */
	.hdr-avatar {
		width: 1.75rem;
		height: 1.75rem;
		border-radius: 50%;
		border: 1px solid rgba(63, 63, 70, 0.4);
	}
	.hdr-username {
		font-size: 0.8125rem;
		color: #a1a1aa;
		text-decoration: none;
		transition: color 0.2s;
	}
	.hdr-username:hover {
		color: #fff;
	}
	.hdr-signout {
		font-size: 0.8125rem;
		color: #52525b;
		text-decoration: none;
		transition: color 0.2s;
	}
	.hdr-signout:hover {
		color: #fff;
	}

	/* Responsive visibility */
	.hdr-desktop {
		display: none;
	}
	.hdr-mobile {
		display: flex;
	}
	@media (min-width: 768px) {
		.hdr-desktop {
			display: flex;
		}
		.hdr-mobile {
			display: none;
		}
	}

	/* Burger */
	.hdr-burger {
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 0.4rem;
		color: #71717a;
		background: none;
		border: none;
		cursor: pointer;
		transition: color 0.2s;
	}
	.hdr-burger:hover {
		color: #fff;
	}

	/* ===== Mobile menu ===== */
	.mob-menu {
		border-top: 1px solid rgba(63, 63, 70, 0.25);
		background: rgba(9, 9, 11, 0.96);
		backdrop-filter: blur(14px);
		-webkit-backdrop-filter: blur(14px);
	}
	.mob-inner {
		max-width: 80rem;
		margin: 0 auto;
		padding: 0.65rem 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	.mob-divider {
		margin: 0.4rem 0;
		border-top: 1px solid rgba(63, 63, 70, 0.25);
	}

	/* Mobile landing links */
	.mob-link {
		display: flex;
		align-items: center;
		padding: 0.6rem 0.85rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		color: #a1a1aa;
		text-decoration: none;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.mob-link:hover {
		color: #fff;
		background: rgba(63, 63, 70, 0.2);
	}
	.mob-link-accent {
		color: #fb923c;
		font-weight: 600;
	}

	/* Mobile app tabs */
	.mob-tab {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.6rem 0.85rem;
		border-radius: 0.5rem;
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.2s;
	}
	.mob-tab-idle {
		color: #a1a1aa;
	}
	.mob-tab-idle:hover {
		color: #fff;
		background: rgba(63, 63, 70, 0.2);
	}
	.mob-tab-active {
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.08);
		box-shadow: inset 0 0 0 1px rgba(245, 158, 11, 0.2);
	}
	.mob-tab-locked {
		color: rgba(113, 113, 122, 0.5);
		cursor: not-allowed;
	}

	/* Mobile user row */
	.mob-user {
		display: flex;
		align-items: center;
		gap: 0.65rem;
		padding: 0.5rem 0.85rem;
	}

	/* Mobile CTA (centered) */
	.mob-cta {
		text-align: center;
		justify-content: center;
	}
</style>
