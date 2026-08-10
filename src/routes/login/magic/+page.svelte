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

<div class="flex min-h-screen items-center justify-center bg-zinc-950">
	<div class="w-full max-w-md p-8">
		<a
			href="/login"
			class="mb-8 inline-flex items-center gap-2 text-zinc-400 transition-colors hover:text-white"
		>
			<svg
				class="h-4 w-4"
				fill="none"
				stroke="currentColor"
				viewBox="0 0 24 24"
			>
				<path
					stroke-linecap="round"
					stroke-linejoin="round"
					stroke-width="2"
					d="M15 19l-7-7 7-7"
				/>
			</svg>
			Back to login
		</a>

		<h1 class="mb-2 text-2xl font-bold text-white">Sign in with email</h1>
		<p class="mb-8 text-zinc-400">We'll send you a magic link to sign in.</p>

		{#if form?.success}
			<div class="rounded-lg border border-green-500/20 bg-green-500/10 p-4">
				<div class="flex items-center gap-3">
					<svg
						class="h-5 w-5 flex-shrink-0 text-green-400"
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
					<div>
						<p class="font-medium text-green-400">Check your email</p>
						<p class="mt-1 text-sm text-zinc-400">
							We've sent a magic link to <span class="text-white"
								>{form.email}</span
							>
						</p>
					</div>
				</div>
			</div>
		{:else}
			<form method="POST" onsubmit={() => (loading = true)}>
				<label for="email" class="mb-2 block text-sm text-zinc-400"
					>Email address</label
				>
				<input
					type="email"
					name="email"
					id="email"
					bind:value={email}
					required
					placeholder="you@example.com"
					class="w-full rounded-lg border border-zinc-700 bg-zinc-800 px-4 py-3 text-white placeholder:text-zinc-500 focus:border-transparent focus:ring-2 focus:ring-white/20 focus:outline-none"
				/>

				{#if form?.error}
					<p class="mt-2 text-sm text-red-400">{form.error}</p>
				{/if}

				<button
					type="submit"
					disabled={loading || !email}
					class="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-white px-4 py-3 font-medium text-zinc-900 transition-colors hover:bg-zinc-200 disabled:bg-zinc-700 disabled:text-zinc-500"
				>
					{#if loading}
						<svg class="h-5 w-5 animate-spin" fill="none" viewBox="0 0 24 24">
							<circle
								class="opacity-25"
								cx="12"
								cy="12"
								r="10"
								stroke="currentColor"
								stroke-width="4"
							></circle>
							<path
								class="opacity-75"
								fill="currentColor"
								d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
							></path>
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
