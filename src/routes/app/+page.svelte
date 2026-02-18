<script lang="ts">
import {
	Calendar,
	Check,
	Copy,
	Download,
	Gift,
	Info,
	Loader2,
	Sparkles,
	X,
} from 'lucide-svelte';
import { track } from '@vercel/analytics';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import { tokenState } from '$lib/token-state.svelte';
import type { AssetGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialGenerations = data.assetGenerations;

let showSignupPrompt = $state(false);

const guestGenerationsRemaining = $derived(
	GUEST_CONFIG.maxGenerations - tokenState.guestGenerationsUsed
);

// Generation form
let prompt = $state('');
let generating = $state(false);
let selectedStyle = $state<string | null>(null);

const stylePresets = [
	{ id: null, label: 'Default' },
	{ id: 'hand-painted', label: 'Hand-Painted' },
	{ id: 'anime', label: 'Anime' },
	{ id: 'cartoon', label: 'Cartoon' },
	{ id: 'realistic', label: 'Realistic' },
	{ id: 'vector', label: 'Vector' },
	{ id: 'outline', label: 'Outline' },
] as const;

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

// Can generate check
const canGenerate = $derived(
	data.isGuest
		? guestGenerationsRemaining > 0
		: tokenState.total >= TOKEN_COST
);

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
	if (!prompt.trim() || generating || !canGenerate) return;

	generating = true;
	try {
		const res = await fetch('/api/assets/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				assetType: 'sprite',
				prompt: prompt.trim(),
				...(selectedStyle && { style: selectedStyle }),
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			return;
		}

		const result = await res.json();
		generations = [result.asset, ...generations];

		// Track generation started
		track('generation_started', { type: 'sprite', is_guest: result.isGuest });

		if (result.isGuest) {
			// Update guest state
			tokenState.guestGenerationsUsed = GUEST_CONFIG.maxGenerations - result.generationsRemaining;
			// Show signup prompt after first generation
			showSignupPrompt = true;
		} else {
			tokenState.tokens = result.tokensRemaining;
			tokenState.bonusTokens = result.bonusTokensRemaining;
		}

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

			// Track completion
			if (updated.status === 'completed') {
				track('generation_completed', { type: 'sprite' });
			}

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
	const confirmMsg = data.isGuest
		? 'Cancel this generation?'
		: 'Cancel this generation? Tokens will be refunded.';
	if (!confirm(confirmMsg)) return;

	try {
		const res = await fetch(`/api/assets/${id}/cancel`, { method: 'POST' });
		if (res.ok) {
			const result = await res.json();
			generations = generations.map((g) =>
				g.id === id
					? { ...g, status: 'failed', errorMessage: 'Cancelled by user' }
					: g,
			);
			if (!data.isGuest && result.tokensRefunded > 0) {
				tokenState.tokens = tokenState.tokens + result.tokensRefunded;
			}
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

<div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
	<!-- Generation Form -->
	<div class="lg:col-span-1">
		<div class="panel sticky top-20">
			<h2 class="panel-title">Generate Sprite</h2>

			{#if data.isGuest}
				<div class="mb-4 flex items-center gap-2 text-sm">
					<span class="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/8 text-amber-400 rounded-lg border border-amber-500/15 text-xs font-medium">
						{guestGenerationsRemaining} of {GUEST_CONFIG.maxGenerations} free generations
					</span>
				</div>
			{/if}

			<div class="mb-4">
				<label for="prompt" class="field-label">Prompt</label>
				<textarea
					id="prompt"
					bind:value={prompt}
					placeholder="Describe your sprite..."
					rows="3"
					class="field-textarea"
				></textarea>
				<div class="suggestions">
					{#each [
						'Medieval knight with sword and shield',
						'Fire mage casting a spell',
						'Pixel treasure chest',
						'Green slime enemy',
						'Health potion bottle',
						'Wooden barrel',
						'Fantasy dragon',
						'Space marine with laser rifle',
					] as suggestion}
						<button
							type="button"
							class="suggestion-chip"
							onclick={() => { prompt = suggestion; }}
						>
							{suggestion}
						</button>
					{/each}
				</div>
			</div>

			<div class="mb-4">
				<label class="field-label">Style</label>
				<div class="flex flex-wrap gap-1.5">
					{#each stylePresets as preset}
						<button
							onclick={() => (selectedStyle = preset.id)}
							class="pill {selectedStyle === preset.id ? 'pill-active' : ''}"
						>
							{preset.label}
						</button>
					{/each}
				</div>
			</div>

			{#if data.isGuest && !canGenerate}
				<a href="/login" class="btn-generate">
					<Sparkles class="w-4 h-4" />
					Sign up to continue
				</a>
				<p class="text-xs text-zinc-500 mt-2 text-center">
					Get 50 free tokens when you sign up
				</p>
			{:else}
				<button
					onclick={generate}
					disabled={!prompt.trim() || generating || !canGenerate}
					class="btn-generate"
				>
					{#if generating}
						<Loader2 class="w-4 h-4 animate-spin" />
						Generating...
					{:else if data.isGuest}
						<Sparkles class="w-4 h-4" />
						Generate (free)
					{:else}
						<Sparkles class="w-4 h-4" />
						Generate ({TOKEN_COST} tokens)
					{/if}
				</button>
			{/if}

			{#if data.isGuest && showSignupPrompt}
				<div class="mt-4 p-3 bg-amber-500/5 border border-amber-500/15 rounded-xl">
					<div class="flex items-start gap-3">
						<Gift class="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
						<div>
							<p class="text-sm text-white font-medium">Save your sprites</p>
							<p class="text-xs text-zinc-500 mt-1">
								Sign up to keep your generations and get 50 free tokens.
							</p>
							<a
								href="/login"
								class="inline-block mt-2 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-zinc-900 text-xs font-semibold rounded-lg transition-colors"
							>
								Sign up free
							</a>
						</div>
					</div>
				</div>
			{/if}
		</div>
	</div>

	<!-- Generation History -->
	<div class="lg:col-span-2">
		<div class="panel">
			<h2 class="panel-title">Your Sprites</h2>

			{#if generations.length === 0}
				<div class="text-center py-16 text-zinc-500">
					<Sparkles class="w-12 h-12 mx-auto mb-3 opacity-30" />
					<p class="text-sm">No sprites yet. Create your first one!</p>
				</div>
			{:else}
				<div class="grid grid-cols-2 md:grid-cols-3 gap-3">
					{#each generations as gen (gen.id)}
						<button
							onclick={() => openModal(gen)}
							class="sprite-thumb"
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
								<div class="sprite-thumb-overlay">
									<span class="p-2 bg-white/15 rounded-lg backdrop-blur-sm">
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
										<Loader2 class="w-6 h-6 mx-auto mb-2 animate-spin text-amber-400" />
										<p class="text-xs text-zinc-400 mb-1">{gen.currentStage || getStatusLabel(gen.status)}</p>
									</div>
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<span
										onclick={(e) => { e.stopPropagation(); cancelGeneration(gen.id); }}
										onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); cancelGeneration(gen.id); } }}
										role="button"
										tabindex="0"
										class="mt-2 px-3 py-1 text-xs bg-zinc-700/40 hover:bg-red-500/15 hover:text-red-400 text-zinc-400 rounded-lg transition-colors cursor-pointer inline-block"
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
							class="btn-secondary"
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
		class="modal-backdrop"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label="Generation details"
	>
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="modal-content"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="modal-header">
				<h3>Generation Details</h3>
				<button onclick={closeModal} class="modal-close">
					<X class="w-5 h-5" />
				</button>
			</div>

			<div class="p-5 overflow-y-auto max-h-[calc(90vh-120px)]">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-5">
					<div class="aspect-square bg-zinc-800/40 rounded-xl overflow-hidden border border-zinc-700/50">
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
									<Loader2 class="w-12 h-12 mx-auto mb-2 animate-spin text-amber-400" />
									<p class="text-sm text-zinc-400">{selectedGeneration.currentStage || getStatusLabel(selectedGeneration.status)}</p>
								</div>
							</div>
						{/if}
					</div>

					<div class="space-y-4">
						<div>
							<div class="flex items-center justify-between mb-1">
								<span class="meta-label">Prompt</span>
								<button
									onclick={() => copyPrompt(selectedGeneration?.prompt || '')}
									class="p-1 hover:bg-zinc-800 rounded transition-colors"
									title="Copy prompt"
								>
									<Copy class="w-3.5 h-3.5 text-zinc-500" />
								</button>
							</div>
							<p class="text-sm text-white bg-zinc-800/40 rounded-xl p-3 border border-zinc-700/50">
								{selectedGeneration.prompt}
							</p>
						</div>

						<div class="grid grid-cols-2 gap-3">
							<div class="meta-card">
								<span class="meta-label">Type</span>
								<span class="meta-value">{getAssetTypeLabel(selectedGeneration.assetType)}</span>
							</div>
							<div class="meta-card">
								<span class="meta-label">Dimensions</span>
								<span class="meta-value">{selectedGeneration.width}x{selectedGeneration.height}</span>
							</div>
							<div class="meta-card">
								<span class="meta-label">Status</span>
								<span class="meta-value {selectedGeneration.status === 'completed' ? 'text-green-400' : selectedGeneration.status === 'failed' ? 'text-red-400' : 'text-amber-400'}">
									{getStatusLabel(selectedGeneration.status)}
								</span>
							</div>
							<div class="meta-card">
								<span class="meta-label">Tokens</span>
								<span class="meta-value">{selectedGeneration.tokenCost}</span>
							</div>
						</div>

						<div class="flex items-center gap-2 text-xs text-zinc-500">
							<Calendar class="w-3.5 h-3.5" />
							<span>Created {formatDate(selectedGeneration.createdAt)}</span>
						</div>

						{#if selectedGeneration.errorMessage}
							<div class="bg-red-500/8 border border-red-500/15 rounded-xl p-3">
								<span class="meta-label text-red-400">Error</span>
								<p class="text-sm text-red-300 mt-1">{selectedGeneration.errorMessage}</p>
							</div>
						{/if}

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

			<div class="modal-footer">
				{#if selectedGeneration.status === 'completed' && (selectedGeneration.resultUrls?.processed || selectedGeneration.resultUrls?.raw)}
					<a
						href={selectedGeneration.resultUrls.processed || selectedGeneration.resultUrls.raw}
						download
						class="btn-download"
					>
						<Download class="w-4 h-4" />
						Download
					</a>
				{/if}
				<button onclick={closeModal} class="btn-secondary">
					Close
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	/* Panels */
	.panel {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		padding: 1.5rem;
		backdrop-filter: blur(6px);
	}
	.panel-title {
		font-weight: 700;
		font-size: 1.05rem;
		color: #fff;
		margin-bottom: 1rem;
	}

	/* Form fields */
	.field-label {
		display: block;
		font-size: .8125rem;
		font-weight: 500;
		color: #a1a1aa;
		margin-bottom: .5rem;
	}
	.field-textarea {
		width: 100%;
		padding: .6rem .75rem;
		background: rgba(39,39,42,.4);
		border: 1px solid rgba(63,63,70,.5);
		border-radius: .65rem;
		color: #fff;
		font-size: .875rem;
		resize: none;
		transition: border-color .2s, box-shadow .2s;
	}
	.field-textarea::placeholder { color: #52525b; }
	.field-textarea:focus {
		outline: none;
		border-color: rgba(245,158,11,.35);
		box-shadow: 0 0 0 3px rgba(245,158,11,.08);
	}

	/* Suggestion chips */
	.suggestions {
		display: flex;
		flex-wrap: wrap;
		gap: .35rem;
		margin-top: .5rem;
	}
	.suggestion-chip {
		padding: .3rem .6rem;
		font-size: .7rem;
		color: #a1a1aa;
		background: rgba(39,39,42,.45);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: 999px;
		cursor: pointer;
		transition: background .15s, color .15s, border-color .15s;
		white-space: nowrap;
	}
	.suggestion-chip:hover {
		background: rgba(63,63,70,.5);
		color: #e4e4e7;
		border-color: rgba(63,63,70,.65);
	}

	/* Style pills */
	.pill {
		padding: .3rem .65rem;
		font-size: .75rem;
		background: rgba(39,39,42,.4);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: 2rem;
		color: #a1a1aa;
		cursor: pointer;
		transition: all .2s;
	}
	.pill:hover { background: rgba(63,63,70,.5); color: #fff; }
	.pill-active {
		background: rgba(245,158,11,.1);
		border-color: rgba(245,158,11,.4);
		color: #fbbf24;
	}

	/* Generate button */
	.btn-generate {
		width: 100%;
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		padding: .75rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600; font-size: .875rem;
		border-radius: .7rem;
		border: none; cursor: pointer;
		text-decoration: none;
		box-shadow: 0 0 20px rgba(245,158,11,.15);
		transition: box-shadow .25s, transform .15s, opacity .2s;
	}
	.btn-generate:hover:not(:disabled) {
		box-shadow: 0 0 28px rgba(245,158,11,.28);
		transform: translateY(-1px);
	}
	.btn-generate:disabled {
		background: rgba(63,63,70,.4);
		color: #71717a;
		cursor: not-allowed;
		box-shadow: none;
	}

	/* Secondary button */
	.btn-secondary {
		padding: .5rem 1rem;
		background: rgba(63,63,70,.3);
		color: #fff;
		font-size: .8125rem; font-weight: 500;
		border-radius: .55rem;
		border: none; cursor: pointer;
		transition: background .2s;
	}
	.btn-secondary:hover { background: rgba(63,63,70,.5); }
	.btn-secondary:disabled { opacity: .5; cursor: not-allowed; }

	/* Sprite thumbnails */
	.sprite-thumb {
		position: relative;
		aspect-ratio: 1;
		background: rgba(39,39,42,.4);
		border-radius: .75rem;
		overflow: hidden;
		border: 1px solid rgba(63,63,70,.4);
		cursor: pointer;
		width: 100%;
		text-align: left;
		transition: border-color .2s, box-shadow .2s;
	}
	.sprite-thumb:hover {
		border-color: rgba(63,63,70,.6);
		box-shadow: 0 2px 12px rgba(0,0,0,.3);
	}
	.sprite-thumb-overlay {
		position: absolute; inset: 0;
		background: rgba(0,0,0,.55);
		opacity: 0;
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		transition: opacity .2s;
	}
	.sprite-thumb:hover .sprite-thumb-overlay { opacity: 1; }

	/* Modal */
	.modal-backdrop {
		position: fixed; inset: 0;
		background: rgba(0,0,0,.75);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 50;
		display: flex; align-items: center; justify-content: center;
		padding: 1rem;
	}
	.modal-content {
		background: rgba(24,24,27,.95);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: 1rem;
		max-width: 42rem; width: 100%;
		max-height: 90vh;
		overflow: hidden;
		backdrop-filter: blur(12px);
	}
	.modal-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(63,63,70,.3);
	}
	.modal-header h3 {
		font-weight: 700; font-size: 1.05rem; color: #fff;
	}
	.modal-close {
		padding: .3rem;
		color: #71717a;
		border-radius: .4rem;
		border: none; cursor: pointer; background: none;
		transition: background .2s, color .2s;
	}
	.modal-close:hover { background: rgba(63,63,70,.3); color: #fff; }
	.modal-footer {
		padding: 1rem 1.25rem;
		border-top: 1px solid rgba(63,63,70,.3);
		display: flex; justify-content: flex-end; gap: .5rem;
	}

	/* Download button */
	.btn-download {
		display: flex; align-items: center; gap: .4rem;
		padding: .5rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600; font-size: .8125rem;
		border-radius: .55rem;
		text-decoration: none;
		transition: box-shadow .2s;
	}
	.btn-download:hover {
		box-shadow: 0 0 16px rgba(245,158,11,.2);
	}

	/* Metadata */
	.meta-label {
		font-size: .6875rem;
		text-transform: uppercase;
		letter-spacing: .04em;
		color: #52525b;
		display: block;
	}
	.meta-value {
		font-size: .8125rem; color: #fff;
	}
	.meta-card {
		background: rgba(39,39,42,.35);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .65rem;
		padding: .7rem;
	}
	.meta-card .meta-label { margin-bottom: .25rem; }
</style>
