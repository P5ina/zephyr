<script lang="ts">
	import { ChevronDown, Gift, Ticket } from 'lucide-svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	let showPromoInput = $state(!!data.promoError);
	let promoInput = $state('');
	let promoError = $state(data.promoError || '');

	function applyPromoCode() {
		const code = promoInput.trim().toUpperCase();
		if (!code) {
			promoError = 'Please enter a promo code';
			return;
		}
		// Redirect to same page with promo param - server will validate
		window.location.href = `/login?promo=${encodeURIComponent(code)}`;
	}
</script>

<svelte:head>
	<title>Sign In | GenSprite - AI Game Asset Generator</title>
	<meta
		name="description"
		content="Sign in to GenSprite to generate AI-powered game sprites, PBR textures, and 8-directional character rotations. Start free with 50 tokens."
	/>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="flex min-h-screen items-center justify-center bg-zinc-950">
	<div class="w-full max-w-md p-8">
		<h1 class="mb-2 text-center text-3xl font-bold text-white">
			<a href="/">GenSprite</a>
		</h1>
		<p class="mb-8 text-center text-zinc-400">AI Image Generation Platform</p>

		{#if data.promoCode}
			<div
				class="mb-6 rounded-xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 p-4"
			>
				<div class="flex items-center gap-3">
					<Gift class="h-5 w-5 flex-shrink-0 text-yellow-400" />
					<div>
						<p class="text-sm font-medium text-white">
							Promo code applied: {data.promoCode}
						</p>
						<p class="mt-0.5 text-xs text-zinc-400">
							Sign up to get {data.promoBonusTokens} bonus tokens!
						</p>
					</div>
				</div>
			</div>
		{/if}

		<div class="space-y-3">
			<a
				href="/login/google"
				class="flex w-full items-center justify-center gap-3 rounded-lg bg-white px-4 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-100"
			>
				<svg class="h-5 w-5" viewBox="0 0 24 24">
					<path
						fill="#4285F4"
						d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
					/>
					<path
						fill="#34A853"
						d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
					/>
					<path
						fill="#FBBC05"
						d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
					/>
					<path
						fill="#EA4335"
						d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
					/>
				</svg>
				Continue with Google
			</a>

			<a
				href="/login/github"
				class="flex w-full items-center justify-center gap-3 rounded-lg bg-zinc-800 px-4 py-3 text-white transition-colors hover:bg-zinc-700"
			>
				<svg class="h-5 w-5" fill="currentColor" viewBox="0 0 24 24">
					<path
						d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"
					/>
				</svg>
				Continue with GitHub
			</a>
		</div>

		<div class="relative my-6">
			<div class="absolute inset-0 flex items-center">
				<div class="w-full border-t border-zinc-800"></div>
			</div>
			<div class="relative flex justify-center text-sm">
				<span class="bg-zinc-950 px-2 text-zinc-500">or</span>
			</div>
		</div>

		<a
			href="/login/magic"
			class="flex w-full items-center justify-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900 px-4 py-3 text-white transition-colors hover:bg-zinc-800"
		>
			<svg
				class="h-5 w-5"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z"
				/>
			</svg>
			Continue with Email
		</a>

		<!-- Promo code section -->
		{#if !data.promoCode}
			<div class="mt-6">
				<button
					type="button"
					onclick={() => (showPromoInput = !showPromoInput)}
					class="flex w-full items-center justify-center gap-2 text-sm text-zinc-500 transition-colors hover:text-zinc-300"
				>
					<Ticket class="h-4 w-4" />
					Have a promo code?
					<ChevronDown
						class="h-4 w-4 transition-transform {showPromoInput
							? 'rotate-180'
							: ''}"
					/>
				</button>

				{#if showPromoInput}
					<div class="mt-3 flex gap-2">
						<input
							type="text"
							bind:value={promoInput}
							placeholder="Enter code"
							class="flex-1 rounded-lg border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-white uppercase placeholder-zinc-500 focus:border-yellow-500/50 focus:ring-2 focus:ring-yellow-500/50 focus:outline-none"
							onkeydown={(e) => e.key === 'Enter' && applyPromoCode()}
						/>
						<button
							type="button"
							onclick={applyPromoCode}
							class="rounded-lg bg-yellow-500 px-4 py-2 text-sm font-medium text-zinc-900 transition-colors hover:bg-yellow-400"
						>
							Apply
						</button>
					</div>
					{#if promoError}
						<p class="mt-2 text-xs text-red-400">{promoError}</p>
					{/if}
				{/if}
			</div>
		{/if}

		{#if data.isPreview}
			<div class="mt-4">
				<a
					href="/login/preview"
					class="flex w-full items-center justify-center gap-3 rounded-lg border border-yellow-500/30 bg-yellow-500/20 px-4 py-3 text-yellow-400 transition-colors hover:bg-yellow-500/30"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
						/>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z"
						/>
					</svg>
					Preview Login
				</a>
			</div>
			<p class="mt-3 text-center text-xs text-zinc-500">
				Preview mode - team members only
			</p>
		{/if}

		{#if data.isDev}
			<div class="mt-4">
				<a
					href="/login/dev"
					class="flex w-full items-center justify-center gap-3 rounded-lg border border-green-500/30 bg-green-500/20 px-4 py-3 text-green-400 transition-colors hover:bg-green-500/30"
				>
					<svg
						class="h-5 w-5"
						fill="none"
						stroke="currentColor"
						viewBox="0 0 24 24"
					>
						<path
							stroke-linecap="round"
							stroke-linejoin="round"
							stroke-width="2"
							d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4"
						/>
					</svg>
					Dev Login
				</a>
			</div>
			<p class="mt-3 text-center text-xs text-zinc-500">
				Development mode - localhost only
			</p>
		{/if}
	</div>
</div>
