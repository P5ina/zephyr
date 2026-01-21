<script lang="ts">
import {
	Download,
	Grid,
	Loader2,
	Sparkles,
	X,
} from 'lucide-svelte';
import type { AssetGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialGenerations = data.assetGenerations;

let tokens = $state(data.user.tokens);
let bonusTokens = $state(data.user.bonusTokens);

// Generation form
let prompt = $state('');
let negativePrompt = $state('');
let assetType = $state<'sprite' | 'pixel_art'>('sprite');
let generating = $state(false);

// Generation history
let generations = $state<AssetGeneration[]>(initialGenerations);
let loadingMore = $state(false);
let hasMore = $state(initialGenerations.length === 20);
let nextCursor = $state<string | null>(
	initialGenerations.length > 0
		? initialGenerations[initialGenerations.length - 1].id
		: null,
);

const TOKEN_COSTS = {
	sprite: 2,
	pixel_art: 2,
};

// Track which generations we're already polling
const pollingSet = new Set<string>();

// Start polling for any pending generations on page load
$effect(() => {
	for (const gen of initialGenerations) {
		if (gen.status !== 'completed' && gen.status !== 'failed' && !pollingSet.has(gen.id)) {
			pollingSet.add(gen.id);
			pollStatus(gen.id);
		}
	}
});

async function generate() {
	if (!prompt.trim() || generating) return;

	generating = true;
	try {
		const res = await fetch('/api/assets/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				assetType,
				prompt: prompt.trim(),
				negativePrompt: negativePrompt.trim() || undefined,
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			return;
		}

		const result = await res.json();
		generations = [result.asset, ...generations];
		tokens = result.tokensRemaining;
		bonusTokens = result.bonusTokensRemaining;

		// Start polling for status if needed
		if (result.asset.status !== 'completed') {
			pollStatus(result.asset.id);
		}
	} finally {
		generating = false;
	}
}

async function pollStatus(id: string) {
	const poll = async () => {
		try {
			const res = await fetch(`/api/assets/${id}/status`);
			if (!res.ok) return;

			const updated = await res.json();
			generations = generations.map((g) => (g.id === id ? updated : g));

			if (updated.status !== 'completed' && updated.status !== 'failed') {
				setTimeout(poll, 2000);
			}
		} catch {
			// Ignore errors, stop polling
		}
	};
	setTimeout(poll, 2000);
}

async function loadMoreGenerations() {
	if (loadingMore || !nextCursor) return;

	loadingMore = true;
	try {
		const res = await fetch(`/api/assets?cursor=${nextCursor}&limit=20`);
		if (res.ok) {
			const result = await res.json();
			generations = [...generations, ...result.assets];
			nextCursor = result.nextCursor;
			hasMore = !!result.nextCursor;
		}
	} finally {
		loadingMore = false;
	}
}

function getStatusLabel(status: string) {
	switch (status) {
		case 'pending':
			return 'Pending';
		case 'queued':
			return 'Queued';
		case 'processing':
			return 'Processing';
		case 'post_processing':
			return 'Finalizing';
		case 'completed':
			return 'Completed';
		case 'failed':
			return 'Failed';
		default:
			return status;
	}
}

async function cancelGeneration(id: string) {
	if (!confirm('Cancel this generation? Tokens will be refunded.')) return;

	try {
		const res = await fetch(`/api/assets/${id}/cancel`, { method: 'POST' });
		if (res.ok) {
			const result = await res.json();
			generations = generations.map((g) =>
				g.id === id ? { ...g, status: 'failed', errorMessage: 'Cancelled by user' } : g,
			);
			tokens = tokens + result.tokensRefunded;
		} else {
			const error = await res.json();
			alert(error.message || 'Failed to cancel');
		}
	} catch {
		alert('Failed to cancel generation');
	}
}
</script>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
	<!-- Generation Form -->
	<div class="lg:col-span-1">
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8">
			<h2 class="text-lg font-semibold text-white mb-4">Generate Sprite</h2>

			<!-- Asset Type -->
			<div class="mb-4">
				<span class="block text-sm font-medium text-zinc-400 mb-2">Type</span>
				<div class="grid grid-cols-2 gap-2">
					<button
						onclick={() => (assetType = 'sprite')}
						class="flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors {assetType === 'sprite'
							? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
							: 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'}"
					>
						<Sparkles class="w-5 h-5" />
						<span class="text-xs">Sprite</span>
						<span class="text-[10px] opacity-60">{TOKEN_COSTS.sprite} tokens</span>
					</button>
					<button
						onclick={() => (assetType = 'pixel_art')}
						class="flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors {assetType === 'pixel_art'
							? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
							: 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'}"
					>
						<Grid class="w-5 h-5" />
						<span class="text-xs">Pixel Art</span>
						<span class="text-[10px] opacity-60">{TOKEN_COSTS.pixel_art} tokens</span>
					</button>
				</div>
			</div>

			<!-- Prompt -->
			<div class="mb-4">
				<label for="prompt" class="block text-sm font-medium text-zinc-400 mb-2">Prompt</label>
				<textarea
					id="prompt"
					bind:value={prompt}
					placeholder="Describe your sprite..."
					rows="3"
					class="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 resize-none"
				></textarea>
			</div>

			<!-- Negative Prompt -->
			<div class="mb-4">
				<label for="negativePrompt" class="block text-sm font-medium text-zinc-400 mb-2">
					Negative Prompt <span class="text-zinc-500">(optional)</span>
				</label>
				<textarea
					id="negativePrompt"
					bind:value={negativePrompt}
					placeholder="What to avoid..."
					rows="2"
					class="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 resize-none"
				></textarea>
			</div>

			<!-- Generate Button -->
			<button
				onclick={generate}
				disabled={!prompt.trim() || generating || tokens + bonusTokens < TOKEN_COSTS[assetType]}
				class="w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-zinc-900 disabled:text-zinc-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
			>
				{#if generating}
					<Loader2 class="w-4 h-4 animate-spin" />
					Generating...
				{:else}
					<Sparkles class="w-4 h-4" />
					Generate ({TOKEN_COSTS[assetType]} tokens)
				{/if}
			</button>
		</div>
	</div>

	<!-- Generation History -->
	<div class="lg:col-span-2">
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<h2 class="text-lg font-semibold text-white mb-4">Your Sprites</h2>

			{#if generations.length === 0}
				<div class="text-center py-12 text-zinc-500">
					<Sparkles class="w-12 h-12 mx-auto mb-3 opacity-50" />
					<p>No sprites yet. Create your first one!</p>
				</div>
			{:else}
				<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
					{#each generations as gen (gen.id)}
						<div class="group relative aspect-square bg-zinc-800/50 rounded-lg overflow-hidden border border-zinc-700">
							{#if gen.status === 'completed' && gen.resultUrls?.raw}
								<img
									src={gen.resultUrls.raw}
									alt={gen.prompt}
									class="w-full h-full object-cover"
								/>
								<div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
									<a
										href={gen.resultUrls.raw}
										download
										class="p-2 bg-white/20 rounded-lg hover:bg-white/30 transition-colors"
									>
										<Download class="w-5 h-5 text-white" />
									</a>
								</div>
							{:else if gen.status === 'failed'}
								<div class="w-full h-full flex items-center justify-center text-red-400">
									<div class="text-center p-4">
										<X class="w-8 h-8 mx-auto mb-2" />
										<p class="text-xs font-medium">Failed</p>
										{#if gen.errorMessage}
											<p class="text-[10px] mt-1 text-red-300/70 max-w-full px-2 break-words line-clamp-3" title={gen.errorMessage}>
												{gen.errorMessage}
											</p>
										{/if}
									</div>
								</div>
							{:else}
								<div class="w-full h-full flex flex-col items-center justify-center">
									<div class="text-center">
										<Loader2 class="w-8 h-8 mx-auto mb-2 animate-spin text-yellow-400" />
										<p class="text-xs text-zinc-400">{getStatusLabel(gen.status)}</p>
									</div>
									<button
										onclick={() => cancelGeneration(gen.id)}
										class="mt-3 px-3 py-1 text-xs bg-zinc-700/50 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 rounded transition-colors"
									>
										Cancel
									</button>
								</div>
							{/if}
							<div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
								<p class="text-xs text-white truncate">{gen.prompt}</p>
							</div>
						</div>
					{/each}
				</div>

				{#if hasMore}
					<div class="mt-6 text-center">
						<button
							onclick={loadMoreGenerations}
							disabled={loadingMore}
							class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm rounded-lg transition-colors disabled:opacity-50"
						>
							{#if loadingMore}
								<Loader2 class="w-4 h-4 animate-spin inline mr-2" />
							{/if}
							Load more
						</button>
					</div>
				{/if}
			{/if}
		</div>
	</div>
</div>
