<script lang="ts">
	import { page } from '$app/stores';
	import { ArrowLeft } from 'lucide-svelte';
	import logo from '$lib/assets/favicon.png';
</script>

<div class="min-h-screen bg-zinc-950 flex flex-col">
	<!-- Animated background gradient -->
	<div class="fixed inset-0 overflow-hidden pointer-events-none">
		<div
			class="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-yellow-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse"
		></div>
		<div
			class="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-amber-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse"
			style="animation-delay: 1s;"
		></div>
	</div>

	<!-- Content -->
	<div class="relative z-10 flex-1 flex items-center justify-center px-4">
		<div class="text-center">
			<!-- Logo -->
			<div class="flex items-center justify-center gap-2 mb-8">
				<img src={logo} alt="GenSprite" class="w-10 h-10 rounded-xl" />
				<span class="text-2xl font-bold text-white">GenSprite</span>
			</div>

			<!-- Error code -->
			<h1
				class="text-8xl md:text-9xl font-bold bg-linear-to-r from-yellow-300 via-amber-400 to-orange-400 bg-clip-text text-transparent mb-4"
			>
				{$page.status}
			</h1>

			<!-- Error message -->
			<p class="text-xl text-zinc-400 mb-8 max-w-md mx-auto">
				{#if $page.status === 404}
					The page you're looking for doesn't exist or has been moved.
				{:else}
					{$page.error?.message || 'Something went wrong.'}
				{/if}
			</p>

			<!-- Back button -->
			<a
				href="/"
				class="group inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-semibold rounded-xl transition-all shadow-lg shadow-yellow-500/25 hover:shadow-yellow-500/40"
			>
				<ArrowLeft class="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
				Back to home
			</a>
		</div>
	</div>

	<!-- Footer -->
	<footer class="relative z-10 border-t border-zinc-800/50">
		<div class="max-w-6xl mx-auto px-4 py-6">
			<p class="text-sm text-zinc-500 text-center">© 2026 GenSprite. All rights reserved.</p>
		</div>
	</footer>
</div>
