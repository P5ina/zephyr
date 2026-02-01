<script lang="ts">
import type { ActionData } from './$types';

let { form }: { form: ActionData } = $props();

let email = $state('');
let loading = $state(false);
</script>

<svelte:head>
	<title>Sign In with Email | GenSprite</title>
	<meta name="robots" content="noindex" />
</svelte:head>

<div class="min-h-screen flex items-center justify-center bg-zinc-950">
	<div class="w-full max-w-md p-8">
		<a href="/login" class="inline-flex items-center gap-2 text-zinc-400 hover:text-white mb-8 transition-colors">
			<svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
				<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M15 19l-7-7 7-7" />
			</svg>
			Back to login
		</a>

		<h1 class="text-2xl font-bold text-white mb-2">Sign in with email</h1>
		<p class="text-zinc-400 mb-8">We'll send you a magic link to sign in.</p>

		{#if form?.success}
			<div class="bg-green-500/10 border border-green-500/20 rounded-lg p-4">
				<div class="flex items-center gap-3">
					<svg class="w-5 h-5 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
						<path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
					</svg>
					<div>
						<p class="text-green-400 font-medium">Check your email</p>
						<p class="text-zinc-400 text-sm mt-1">
							We've sent a magic link to <span class="text-white">{form.email}</span>
						</p>
					</div>
				</div>
			</div>
		{:else}
			<form method="POST" onsubmit={() => loading = true}>
				<label for="email" class="block text-sm text-zinc-400 mb-2">Email address</label>
				<input
					type="email"
					name="email"
					id="email"
					bind:value={email}
					required
					placeholder="you@example.com"
					class="w-full px-4 py-3 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder:text-zinc-500 focus:outline-none focus:ring-2 focus:ring-white/20 focus:border-transparent"
				/>

				{#if form?.error}
					<p class="mt-2 text-sm text-red-400">{form.error}</p>
				{/if}

				<button
					type="submit"
					disabled={loading || !email}
					class="mt-4 w-full px-4 py-3 bg-white hover:bg-zinc-200 disabled:bg-zinc-700 text-zinc-900 disabled:text-zinc-500 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
				>
					{#if loading}
						<svg class="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
							<path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
						</svg>
						Sending...
					{:else}
						Send magic link
					{/if}
				</button>
			</form>
		{/if}
	</div>
</div>
