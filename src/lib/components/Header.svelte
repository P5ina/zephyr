<script lang="ts">
import { ArrowLeft, Menu, X } from 'lucide-svelte';
import logo from '$lib/assets/favicon.png';

interface Props {
	user?: { id: string } | null;
	variant?: 'full' | 'simple';
	showBack?: boolean;
	showAuth?: boolean;
	ctaText?: string;
	ctaHref?: string;
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
}

let {
	user = null,
	variant = 'full',
	showBack = false,
	showAuth = true,
	ctaText,
	ctaHref,
	maxWidth = '6xl',
}: Props = $props();

let mobileMenuOpen = $state(false);

const maxWidthClass = {
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
	xl: 'max-w-xl',
	'2xl': 'max-w-2xl',
	'4xl': 'max-w-4xl',
	'6xl': 'max-w-6xl',
};

function toggleMobileMenu() {
	mobileMenuOpen = !mobileMenuOpen;
}

function closeMobileMenu() {
	mobileMenuOpen = false;
}
</script>

<nav class="relative z-10 border-b border-zinc-800/50 backdrop-blur-sm">
	<div class="{maxWidthClass[maxWidth]} mx-auto px-4 py-4 flex items-center justify-between">
		<div class="flex items-center gap-4">
			{#if showBack}
				<a href="/" class="p-2 text-zinc-400 hover:text-white transition-colors">
					<ArrowLeft class="w-5 h-5" />
				</a>
			{/if}
			<a href="/" class="flex items-center gap-2">
				<img src={logo} alt="GenSprite" class="w-8 h-8 rounded-lg" />
				<span class="text-xl font-bold text-white">GenSprite</span>
			</a>
		</div>

		<!-- Desktop navigation -->
		{#if variant === 'full' || showAuth}
			<div class="hidden sm:flex items-center gap-6">
				{#if variant === 'full'}
					<a href="/#features" class="text-sm text-zinc-400 hover:text-white transition-colors">
						Features
					</a>
					<a href="/pricing" class="text-sm text-zinc-400 hover:text-white transition-colors">
						Pricing
					</a>
				{/if}

				{#if showAuth}
					{#if user}
						<a
							href={ctaHref || '/app'}
							class="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
						>
							{ctaText || (variant === 'full' ? 'Go to App' : 'Open App')}
						</a>
					{:else}
						<a
							href="/login"
							class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm border border-white/10"
						>
							Sign in
						</a>
					{/if}
				{/if}
			</div>
		{/if}

		<!-- Mobile menu button -->
		{#if variant === 'full' || showAuth}
			<button
				onclick={toggleMobileMenu}
				class="sm:hidden p-2 text-zinc-400 hover:text-white transition-colors"
				aria-label="Toggle menu"
			>
				{#if mobileMenuOpen}
					<X class="w-5 h-5" />
				{:else}
					<Menu class="w-5 h-5" />
				{/if}
			</button>
		{/if}
	</div>

	<!-- Mobile menu -->
	{#if mobileMenuOpen && (variant === 'full' || showAuth)}
		<div class="sm:hidden border-t border-zinc-800/50 bg-zinc-900/95 backdrop-blur-sm">
			<div class="{maxWidthClass[maxWidth]} mx-auto px-4 py-4 flex flex-col gap-4">
				{#if variant === 'full'}
					<a
						href="/#features"
						onclick={closeMobileMenu}
						class="text-sm text-zinc-400 hover:text-white transition-colors py-2"
					>
						Features
					</a>
					<a
						href="/pricing"
						onclick={closeMobileMenu}
						class="text-sm text-zinc-400 hover:text-white transition-colors py-2"
					>
						Pricing
					</a>
				{/if}

				{#if showAuth}
					{#if user}
						<a
							href={ctaHref || '/app'}
							onclick={closeMobileMenu}
							class="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 text-sm font-medium rounded-lg transition-colors text-center"
						>
							{ctaText || (variant === 'full' ? 'Go to App' : 'Open App')}
						</a>
					{:else}
						<a
							href="/login"
							onclick={closeMobileMenu}
							class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm border border-white/10 text-center"
						>
							Sign in
						</a>
					{/if}
				{/if}
			</div>
		</div>
	{/if}
</nav>
