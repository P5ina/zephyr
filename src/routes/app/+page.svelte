<script lang="ts">
import {
	Coins,
	Download,
	Grid,
	Layers,
	Loader2,
	Settings,
	Sparkles,
	X,
} from 'lucide-svelte';
import type { AssetGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// Capture initial values for local state management
// svelte-ignore state_referenced_locally
const initialUser = data.user;
// svelte-ignore state_referenced_locally
const initialGenerations = data.assetGenerations;

let tokens = $state(initialUser.tokens);
let bonusTokens = $state(initialUser.bonusTokens);
let nsfwEnabled = $state(initialUser.nsfwEnabled);
let settingsOpen = $state(false);
let savingSettings = $state(false);

// Generation form
let prompt = $state('');
let negativePrompt = $state('');
let assetType = $state<'sprite' | 'pixel_art' | 'texture'>('sprite');
let width = $state(512);
let height = $state(512);
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
	texture: 3,
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

async function toggleNsfw() {
	savingSettings = true;
	const newValue = !nsfwEnabled;
	try {
		const res = await fetch('/api/settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ nsfwEnabled: newValue }),
		});
		if (res.ok) {
			nsfwEnabled = newValue;
		}
	} finally {
		savingSettings = false;
	}
}

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
				width,
				height,
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			return;
		}

		const data = await res.json();
		generations = [data.asset, ...generations];
		tokens = data.tokensRemaining;
		bonusTokens = data.bonusTokensRemaining;

		// Start polling for status if needed
		if (data.asset.status !== 'completed') {
			pollStatus(data.asset.id);
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
			const data = await res.json();
			generations = [...generations, ...data.assets];
			nextCursor = data.nextCursor;
			hasMore = !!data.nextCursor;
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
			const data = await res.json();
			generations = generations.map((g) =>
				g.id === id ? { ...g, status: 'failed', errorMessage: 'Cancelled by user' } : g,
			);
			// Update token balance
			tokens = tokens + data.tokensRefunded;
		} else {
			const error = await res.json();
			alert(error.message || 'Failed to cancel');
		}
	} catch {
		alert('Failed to cancel generation');
	}
}
</script>

<div class="min-h-screen bg-zinc-950">
	<header class="border-b border-zinc-800">
		<div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
			<div class="flex items-center gap-6">
				<a href="/" class="text-xl font-bold text-white hover:text-yellow-400 transition-colors">Zephyr</a>
				<nav class="flex items-center gap-4">
					<a href="/app" class="text-sm text-white font-medium">Generate</a>
				</nav>
			</div>
			<div class="flex items-center gap-4">
				<a
					href="/app/billing"
					class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
					title="Monthly: {tokens}, Bonus: {bonusTokens}"
				>
					<Coins class="w-4 h-4 text-yellow-500" />
					<span class="text-sm font-medium text-white">{tokens + bonusTokens}</span>
				</a>
				<div class="relative">
					<button
						onclick={() => (settingsOpen = !settingsOpen)}
						class="p-2 text-zinc-400 hover:text-white transition-colors"
					>
						<Settings class="w-5 h-5" />
					</button>
					{#if settingsOpen}
						<div class="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
							<div class="flex items-center justify-between p-3 border-b border-zinc-800">
								<span class="text-sm font-medium text-white">Settings</span>
								<button
									onclick={() => (settingsOpen = false)}
									class="text-zinc-400 hover:text-white"
								>
									<X class="w-4 h-4" />
								</button>
							</div>
							<div class="p-3">
								<div class="flex items-center justify-between cursor-pointer">
									<span class="text-sm text-zinc-300">Allow NSFW content</span>
									<button
										onclick={toggleNsfw}
										disabled={savingSettings}
										aria-label="Toggle NSFW content"
										aria-pressed={nsfwEnabled}
										class="relative w-11 h-6 rounded-full transition-colors {nsfwEnabled
											? 'bg-yellow-500'
											: 'bg-zinc-700'}"
									>
										<span
											class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform {nsfwEnabled
												? 'translate-x-5'
												: 'translate-x-0'}"
										></span>
									</button>
								</div>
							</div>
						</div>
					{/if}
				</div>
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
			</div>
		</div>
	</header>

	<main class="max-w-7xl mx-auto px-4 py-8">
		<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
			<!-- Generation Form -->
			<div class="lg:col-span-1">
				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8">
					<h2 class="text-lg font-semibold text-white mb-4">Generate Asset</h2>

					<!-- Asset Type -->
					<div class="mb-4">
						<span class="block text-sm font-medium text-zinc-400 mb-2">Asset Type</span>
						<div class="grid grid-cols-3 gap-2">
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
							<button
								onclick={() => (assetType = 'texture')}
								class="flex flex-col items-center gap-1 p-3 rounded-lg border transition-colors {assetType === 'texture'
									? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
									: 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'}"
							>
								<Layers class="w-5 h-5" />
								<span class="text-xs">Texture</span>
								<span class="text-[10px] opacity-60">{TOKEN_COSTS.texture} tokens</span>
							</button>
						</div>
					</div>

					<!-- Prompt -->
					<div class="mb-4">
						<label for="prompt" class="block text-sm font-medium text-zinc-400 mb-2">Prompt</label>
						<textarea
							id="prompt"
							bind:value={prompt}
							placeholder="Describe your asset..."
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

					<!-- Size -->
					<div class="mb-6">
						<span class="block text-sm font-medium text-zinc-400 mb-2">Size</span>
						<div class="flex gap-2">
							<div class="flex-1">
								<label for="width-select" class="text-xs text-zinc-500">Width</label>
								<select
									id="width-select"
									bind:value={width}
									class="w-full mt-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
								>
									<option value={256}>256</option>
									<option value={512}>512</option>
									<option value={768}>768</option>
									<option value={1024}>1024</option>
								</select>
							</div>
							<div class="flex-1">
								<label for="height-select" class="text-xs text-zinc-500">Height</label>
								<select
									id="height-select"
									bind:value={height}
									class="w-full mt-1 px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white focus:outline-none focus:ring-2 focus:ring-yellow-500/50"
								>
									<option value={256}>256</option>
									<option value={512}>512</option>
									<option value={768}>768</option>
									<option value={1024}>1024</option>
								</select>
							</div>
						</div>
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
					<h2 class="text-lg font-semibold text-white mb-4">Your Assets</h2>

					{#if generations.length === 0}
						<div class="text-center py-12 text-zinc-500">
							<Sparkles class="w-12 h-12 mx-auto mb-3 opacity-50" />
							<p>No assets yet. Create your first one!</p>
						</div>
					{:else}
						<div class="grid grid-cols-2 md:grid-cols-3 gap-4">
							{#each generations as gen (gen.id)}
								<div class="group relative aspect-square bg-zinc-800/50 rounded-lg overflow-hidden border border-zinc-700">
									{#if gen.status === 'completed' && gen.resultUrls?.processed}
										<img
											src={gen.resultUrls.processed}
											alt={gen.prompt}
											class="w-full h-full object-cover"
										/>
										<div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
											<a
												href={gen.resultUrls.processed}
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
												<p class="text-xs">Failed</p>
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
	</main>
</div>
