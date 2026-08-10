<script lang="ts">
	import { ArrowLeft } from 'lucide-svelte';
	import { page } from '$app/stores';
	import logo from '$lib/assets/favicon.png';
</script>

<div class="flex min-h-screen flex-col bg-zinc-950">
	<!-- Animated background gradient -->
	<div class="pointer-events-none fixed inset-0 overflow-hidden">
		<div
			class="absolute -top-1/2 -left-1/2 h-full w-full animate-pulse rounded-full bg-gradient-to-br from-yellow-500/20 via-transparent to-transparent blur-3xl"
		></div>
		<div
			class="absolute -right-1/2 -bottom-1/2 h-full w-full animate-pulse rounded-full bg-gradient-to-tl from-amber-500/20 via-transparent to-transparent blur-3xl"
			style="animation-delay: 1s;"
		></div>
	</div>

	<!-- Content -->
	<div class="relative z-10 flex flex-1 items-center justify-center px-4">
		<div class="text-center">
			<!-- Logo -->
			<div class="mb-8 flex items-center justify-center gap-2">
				<img src={logo} alt="GenSprite" class="h-10 w-10 rounded-xl" />
				<span class="text-2xl font-bold text-white">GenSprite</span>
			</div>

			<!-- Error code -->
			<h1
				class="mb-4 bg-linear-to-r from-yellow-300 via-amber-400 to-orange-400 bg-clip-text text-8xl font-bold text-transparent md:text-9xl"
			>
				{$page.status}
			</h1>

			<!-- Error message -->
			<p class="mx-auto mb-8 max-w-md text-xl text-zinc-400">
				{#if $page.status === 404}
					The page you're looking for doesn't exist or has been moved.
				{:else}
					{$page.error?.message || 'Something went wrong.'}
				{/if}
			</p>

			<!-- Back button -->
			<a
				href="/"
				class="group inline-flex items-center gap-2 rounded-xl bg-linear-to-r from-yellow-500 to-amber-500 px-8 py-4 font-semibold text-zinc-900 shadow-lg shadow-yellow-500/25 transition-all hover:from-yellow-400 hover:to-amber-400 hover:shadow-yellow-500/40"
			>
				<ArrowLeft
					class="h-4 w-4 transition-transform group-hover:-translate-x-1"
				/>
				Back to home
			</a>
		</div>
	</div>

	<!-- Footer -->
	<footer class="relative z-10 border-t border-zinc-800/50">
		<div class="mx-auto max-w-6xl px-4 py-6">
			<p class="text-center text-sm text-zinc-500">
				© 2026 Triangle Interactive, LLC
			</p>
		</div>
	</footer>
</div>
