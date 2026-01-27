<script lang="ts">
import {
	Calendar,
	Check,
	Copy,
	Download,
	Info,
	Loader2,
	Sparkles,
	X,
} from 'lucide-svelte';
import { PRICING } from '$lib/pricing';
import type { AssetGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialGenerations = data.assetGenerations;

// svelte-ignore state_referenced_locally
let tokens = $state(data.user.tokens);
// svelte-ignore state_referenced_locally
let bonusTokens = $state(data.user.bonusTokens);

// Generation form
let prompt = $state('');
let generating = $state(false);

// Modal state
let selectedGeneration = $state<AssetGeneration | null>(null);

// Generation history
let generations = $state<AssetGeneration[]>(initialGenerations);
let loadingMore = $state(false);
let hasMore = $state(initialGenerations.length === 20);
let nextCursor = $state<string | null>(
	initialGenerations.length > 0
		? initialGenerations[initialGenerations.length - 1].id
		: null,
);

const TOKEN_COST = PRICING.tokenCosts.sprite;

// Track which generations we're already polling
const pollingSet = new Set<string>();

// Start polling for any pending generations on page load
$effect(() => {
	for (const gen of initialGenerations) {
		if (
			gen.status !== 'completed' &&
			gen.status !== 'failed' &&
			!pollingSet.has(gen.id)
		) {
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
				assetType: 'sprite',
				prompt: prompt.trim(),
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
	let retryCount = 0;
	const maxRetries = 5;

	const poll = async () => {
		try {
			const res = await fetch(`/api/assets/${id}/status`);
			if (!res.ok) {
				retryCount++;
				if (retryCount < maxRetries) {
					setTimeout(poll, 2000);
				}
				return;
			}

			retryCount = 0;
			const updated = await res.json();
			generations = generations.map((g) => (g.id === id ? updated : g));

			if (updated.status !== 'completed' && updated.status !== 'failed') {
				setTimeout(poll, 2000);
			}
		} catch {
			retryCount++;
			if (retryCount < maxRetries) {
				setTimeout(poll, 2000);
			}
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
				g.id === id
					? { ...g, status: 'failed', errorMessage: 'Cancelled by user' }
					: g,
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

function openModal(gen: AssetGeneration) {
	selectedGeneration = gen;
}

function closeModal() {
	selectedGeneration = null;
}

function copyPrompt(text: string) {
	navigator.clipboard.writeText(text);
}

function formatDate(date: Date | string | null) {
	if (!date) return 'N/A';
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function getAssetTypeLabel(type: string) {
	switch (type) {
		case 'sprite':
			return 'Sprite';
		case 'texture':
			return 'Texture';
		default:
			return type;
	}
}
</script>

<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
	<!-- Generation Form -->
	<div class="lg:col-span-1">
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8">
			<h2 class="text-lg font-semibold text-white mb-4">Generate Sprite</h2>

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

			<!-- Generate Button -->
			<button
				onclick={generate}
				disabled={!prompt.trim() || generating || tokens + bonusTokens < TOKEN_COST}
				class="w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-zinc-900 disabled:text-zinc-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
			>
				{#if generating}
					<Loader2 class="w-4 h-4 animate-spin" />
					Generating...
				{:else}
					<Sparkles class="w-4 h-4" />
					Generate ({TOKEN_COST} tokens)
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
						<button
							onclick={() => openModal(gen)}
							class="group relative aspect-square bg-zinc-800/50 rounded-lg overflow-hidden border border-zinc-700 cursor-pointer w-full text-left hover:border-zinc-600 transition-colors"
						>
							{#if gen.status === 'completed'}
								{#if gen.resultUrls?.processed || gen.resultUrls?.raw}
									<img
										src={gen.resultUrls.processed || gen.resultUrls.raw}
										alt={gen.prompt}
										class="w-full h-full object-cover"
									/>
								{:else}
									<div class="w-full h-full flex items-center justify-center bg-zinc-800">
										<Check class="w-8 h-8 text-green-400" />
									</div>
								{/if}
								<div class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
									<span class="p-2 bg-white/20 rounded-lg">
										<Info class="w-5 h-5 text-white" />
									</span>
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
								<div class="w-full h-full flex flex-col items-center justify-center p-3">
									<div class="text-center w-full">
										<Loader2 class="w-6 h-6 mx-auto mb-2 animate-spin text-yellow-400" />
										<p class="text-xs text-zinc-400 mb-1">{gen.currentStage || getStatusLabel(gen.status)}</p>
									</div>
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span
										onclick={(e) => { e.stopPropagation(); cancelGeneration(gen.id); }}
										onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); cancelGeneration(gen.id); } }}
										role="button"
										tabindex="0"
										class="mt-2 px-3 py-1 text-xs bg-zinc-700/50 hover:bg-red-500/20 hover:text-red-400 text-zinc-400 rounded transition-colors cursor-pointer inline-block"
									>
										Cancel
									</span>
								</div>
							{/if}
							<div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
								<p class="text-xs text-white truncate">{gen.prompt}</p>
							</div>
						</button>
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

<!-- Detail Modal -->
{#if selectedGeneration}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div
		class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Generation details"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-2xl w-full max-h-[90vh] overflow-hidden"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-zinc-800">
				<h3 class="text-lg font-semibold text-white">Generation Details</h3>
				<button
					onclick={closeModal}
					class="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
				>
					<X class="w-5 h-5 text-zinc-400" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-4">
					<!-- Image Preview -->
					<div class="aspect-square bg-zinc-800/50 rounded-lg overflow-hidden border border-zinc-700">
						{#if selectedGeneration.status === 'completed'}
							{#if selectedGeneration.resultUrls?.processed || selectedGeneration.resultUrls?.raw}
								<img
									src={selectedGeneration.resultUrls.processed || selectedGeneration.resultUrls.raw}
									alt={selectedGeneration.prompt}
									class="w-full h-full object-contain"
								/>
							{:else}
								<div class="w-full h-full flex items-center justify-center">
									<div class="text-center">
										<Check class="w-12 h-12 mx-auto mb-2 text-green-400" />
										<p class="text-sm text-zinc-400">Completed</p>
									</div>
								</div>
							{/if}
						{:else if selectedGeneration.status === 'failed'}
							<div class="w-full h-full flex items-center justify-center text-red-400">
								<div class="text-center">
									<X class="w-12 h-12 mx-auto mb-2" />
									<p class="text-sm">Generation Failed</p>
								</div>
							</div>
						{:else}
							<div class="w-full h-full flex items-center justify-center">
								<div class="text-center">
									<Loader2 class="w-12 h-12 mx-auto mb-2 animate-spin text-yellow-400" />
									<p class="text-sm text-zinc-400">{selectedGeneration.currentStage || getStatusLabel(selectedGeneration.status)}</p>
								</div>
							</div>
						{/if}
					</div>

					<!-- Details -->
					<div class="space-y-4">
						<!-- Prompt -->
						<div>
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs text-zinc-500 uppercase tracking-wide">Prompt</span>
								<button
									onclick={() => copyPrompt(selectedGeneration?.prompt || '')}
									class="p-1 hover:bg-zinc-800 rounded transition-colors"
									title="Copy prompt"
								>
									<Copy class="w-3.5 h-3.5 text-zinc-500" />
								</button>
							</div>
							<p class="text-sm text-white bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								{selectedGeneration.prompt}
							</p>
						</div>

						<!-- Metadata Grid -->
						<div class="grid grid-cols-2 gap-3">
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Type</span>
								<span class="text-sm text-white">{getAssetTypeLabel(selectedGeneration.assetType)}</span>
							</div>
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Dimensions</span>
								<span class="text-sm text-white">{selectedGeneration.width}x{selectedGeneration.height}</span>
							</div>
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Status</span>
								<span class="text-sm {selectedGeneration.status === 'completed' ? 'text-green-400' : selectedGeneration.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}">
									{getStatusLabel(selectedGeneration.status)}
								</span>
							</div>
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Tokens</span>
								<span class="text-sm text-white">{selectedGeneration.tokenCost}</span>
							</div>
						</div>

						<!-- Dates -->
						<div class="flex items-center gap-2 text-xs text-zinc-500">
							<Calendar class="w-3.5 h-3.5" />
							<span>Created {formatDate(selectedGeneration.createdAt)}</span>
						</div>

						<!-- Error Message -->
						{#if selectedGeneration.errorMessage}
							<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
								<span class="text-xs text-red-400 uppercase tracking-wide block mb-1">Error</span>
								<p class="text-sm text-red-300">{selectedGeneration.errorMessage}</p>
							</div>
						{/if}

						<!-- Seed -->
						{#if selectedGeneration.seed}
							<div class="text-xs text-zinc-500">
								Seed: {selectedGeneration.seed}
							</div>
						{/if}
						{#if selectedGeneration.runpodJobId}
							<div class="text-xs text-zinc-500 font-mono">
								Job: {selectedGeneration.runpodJobId}
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-zinc-800 flex justify-end gap-2">
				{#if selectedGeneration.status === 'completed' && (selectedGeneration.resultUrls?.processed || selectedGeneration.resultUrls?.raw)}
					<a
						href={selectedGeneration.resultUrls.processed || selectedGeneration.resultUrls.raw}
						download
						class="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-medium rounded-lg transition-colors"
					>
						<Download class="w-4 h-4" />
						Download
					</a>
				{/if}
				<button
					onclick={closeModal}
					class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
