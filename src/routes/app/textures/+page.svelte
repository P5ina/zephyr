<script lang="ts">
import { Canvas } from '@threlte/core';
import {
	Box,
	Check,
	ChevronLeft,
	ChevronRight,
	Circle,
	Download,
	Layers,
	Loader2,
	Plus,
	RotateCcw,
	Sparkles,
	Square,
	X,
} from 'lucide-svelte';
import MaterialPreview from '$lib/components/three/MaterialPreview.svelte';
import { PRICING } from '$lib/pricing';
import type { TextureGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialGenerations = data.textureGenerations;

// svelte-ignore state_referenced_locally
let tokens = $state(data.user.tokens);
// svelte-ignore state_referenced_locally
let bonusTokens = $state(data.user.bonusTokens);

// View mode: 'new' for creating new generation, or generation ID for viewing existing
let viewMode = $state<'new' | string>(
	initialGenerations.length > 0 ? initialGenerations[0].id : 'new',
);

// Generation form
let prompt = $state('');
let generating = $state(false);
let currentGeneratingId = $state<string | null>(null);

// Preview shape
let previewShape = $state<'sphere' | 'cube' | 'plane'>('sphere');
let autoRotate = $state(true);

// History
let textureGenerations = $state<TextureGeneration[]>(initialGenerations);

// Track polling
const pollingSet = new Set<string>();

// Generation status
let status = $state<string | null>(null);

const TOKEN_COST = PRICING.tokenCosts.texture;

// Derived: currently selected generation (if viewing existing)
const selectedGeneration = $derived(
	viewMode !== 'new' ? textureGenerations.find((g) => g.id === viewMode) : null,
);

// Derived: textures to display
const displayTextures = $derived(
	selectedGeneration
		? {
				basecolor: selectedGeneration.basecolorUrl,
				normal: selectedGeneration.normalUrl,
				roughness: selectedGeneration.roughnessUrl,
				metallic: selectedGeneration.metallicUrl,
				height: selectedGeneration.heightUrl,
			}
		: {
				basecolor: null,
				normal: null,
				roughness: null,
				metallic: null,
				height: null,
			},
);

const hasAnyTexture = $derived(
	Object.values(displayTextures).some((v) => v !== null),
);

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

function startNewGeneration() {
	viewMode = 'new';
	prompt = '';
}

function selectGeneration(id: string) {
	viewMode = id;
}

async function generate() {
	if (!prompt.trim() || generating) return;
	if (tokens + bonusTokens < TOKEN_COST) {
		alert('Not enough tokens');
		return;
	}

	generating = true;
	status = 'Starting generation...';

	try {
		const res = await fetch('/api/textures/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ prompt: prompt.trim() }),
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			generating = false;
			status = null;
			return;
		}

		const result = await res.json();
		tokens = result.tokensRemaining ?? tokens;
		bonusTokens = result.bonusTokensRemaining ?? bonusTokens;

		// Poll for status
		if (result.id) {
			// Add to history
			const newGen: TextureGeneration = {
				id: result.id,
				userId: data.user.id,
				prompt: prompt.trim(),
				status: 'pending',
				progress: 0,
				currentStage: null,
				basecolorUrl: null,
				normalUrl: null,
				roughnessUrl: null,
				metallicUrl: null,
				heightUrl: null,
				seed: null,
				tokenCost: TOKEN_COST,
				bonusTokenCost: 0,
				errorMessage: null,
				createdAt: new Date(),
				completedAt: null,
			};
			textureGenerations = [newGen, ...textureGenerations];
			currentGeneratingId = result.id;
			viewMode = result.id;
			pollingSet.add(result.id);
			await pollStatus(result.id);
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate textures');
	} finally {
		generating = false;
		status = null;
		currentGeneratingId = null;
	}
}

async function cancelGeneration(id: string) {
	if (!confirm('Cancel this generation? Your tokens will be refunded.')) return;

	try {
		const res = await fetch(`/api/textures/${id}/cancel`, { method: 'POST' });
		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to cancel');
			return;
		}

		const result = await res.json();

		// Update generation status locally
		textureGenerations = textureGenerations.map((g) =>
			g.id === id
				? { ...g, status: 'failed', errorMessage: 'Cancelled by user' }
				: g,
		);

		// Update tokens
		tokens = tokens + result.regularTokensRefunded;
		bonusTokens = bonusTokens + result.bonusTokensRefunded;

		// Stop polling
		pollingSet.delete(id);

		if (currentGeneratingId === id) {
			generating = false;
			currentGeneratingId = null;
			status = null;
		}
	} catch (e) {
		console.error('Cancel error:', e);
		alert('Failed to cancel generation');
	}
}

async function pollStatus(id: string) {
	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/textures/${id}/status`);
			if (!res.ok) return;

			const result = await res.json();
			status = result.statusMessage || result.status;

			// Update generation in list
			textureGenerations = textureGenerations.map((g) =>
				g.id === id
					? {
							...g,
							status: result.status,
							progress: result.progress || 0,
							currentStage: result.statusMessage,
							basecolorUrl: result.textures?.basecolor || g.basecolorUrl,
							normalUrl: result.textures?.normal || g.normalUrl,
							roughnessUrl: result.textures?.roughness || g.roughnessUrl,
							metallicUrl: result.textures?.metallic || g.metallicUrl,
							heightUrl: result.textures?.height || g.heightUrl,
						}
					: g,
			);

			if (result.status === 'completed') {
				pollingSet.delete(id);
				tokens = result.tokensRemaining ?? tokens;
				bonusTokens = result.bonusTokensRemaining ?? bonusTokens;
				if (currentGeneratingId === id) {
					generating = false;
					currentGeneratingId = null;
					status = null;
				}
				return;
			}

			if (result.status === 'failed') {
				pollingSet.delete(id);
				if (currentGeneratingId === id) {
					generating = false;
					currentGeneratingId = null;
					status = null;
				}
				alert(result.error || 'Generation failed');
				return;
			}

			await new Promise((r) => setTimeout(r, 2000));
			return poll();
		} catch {
			// Ignore errors
		}
	};
	await poll();
}

function downloadTexture(type: keyof typeof displayTextures) {
	const url = displayTextures[type];
	if (!url) return;

	const name = selectedGeneration?.prompt || prompt;
	const a = document.createElement('a');
	a.href = url;
	a.download = `${name.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${type}.png`;
	a.click();
}

function downloadAll() {
	for (const type of Object.keys(
		displayTextures,
	) as (keyof typeof displayTextures)[]) {
		if (displayTextures[type]) {
			setTimeout(() => downloadTexture(type), 100);
		}
	}
}

function formatDate(date: Date | string | null) {
	if (!date) return '';
	const d = typeof date === 'string' ? new Date(date) : date;
	const now = new Date();
	const diff = now.getTime() - d.getTime();
	const mins = Math.floor(diff / 60000);
	const hours = Math.floor(diff / 3600000);
	const days = Math.floor(diff / 86400000);

	if (mins < 1) return 'Just now';
	if (mins < 60) return `${mins}m ago`;
	if (hours < 24) return `${hours}h ago`;
	if (days < 7) return `${days}d ago`;
	return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// History navigation
let historyScrollContainer = $state<HTMLDivElement | null>(null);

function scrollHistory(direction: 'left' | 'right') {
	if (!historyScrollContainer) return;
	const scrollAmount = 200;
	historyScrollContainer.scrollBy({
		left: direction === 'left' ? -scrollAmount : scrollAmount,
		behavior: 'smooth',
	});
}
</script>

<div class="flex flex-col h-full gap-4">
	<!-- History Bar -->
	<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-3">
		<div class="flex items-center gap-2">
			<!-- New Generation Button -->
			<button
				onclick={startNewGeneration}
				class="flex-shrink-0 w-16 h-16 rounded-lg border-2 border-dashed {viewMode === 'new' ? 'border-yellow-500 bg-yellow-500/10' : 'border-zinc-700 hover:border-zinc-600'} flex items-center justify-center transition-colors"
			>
				<Plus class="w-6 h-6 {viewMode === 'new' ? 'text-yellow-400' : 'text-zinc-500'}" />
			</button>

			<!-- Scroll Left -->
			{#if textureGenerations.length > 0}
				<button
					onclick={() => scrollHistory('left')}
					class="flex-shrink-0 p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
				>
					<ChevronLeft class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}

			<!-- History Items -->
			<div
				bind:this={historyScrollContainer}
				class="flex-1 flex gap-2 overflow-x-auto scrollbar-hide"
				style="scrollbar-width: none; -ms-overflow-style: none;"
			>
				{#each textureGenerations as gen (gen.id)}
					<button
						onclick={() => selectGeneration(gen.id)}
						class="flex-shrink-0 relative w-16 h-16 rounded-lg overflow-hidden border-2 {viewMode === gen.id ? 'border-yellow-500' : 'border-zinc-700 hover:border-zinc-600'} transition-colors"
					>
						{#if gen.status === 'completed' && gen.basecolorUrl}
							<img
								src={gen.basecolorUrl}
								alt={gen.prompt}
								class="w-full h-full object-cover bg-zinc-800"
							/>
						{:else if gen.status === 'failed'}
							<div class="w-full h-full bg-zinc-800 flex items-center justify-center">
								<X class="w-5 h-5 text-red-400" />
							</div>
						{:else}
							<div class="w-full h-full bg-zinc-800 flex flex-col items-center justify-center">
								<Loader2 class="w-5 h-5 animate-spin text-yellow-400" />
								{#if gen.progress > 0}
									<span class="text-[9px] text-yellow-400 mt-0.5">{gen.progress}%</span>
								{/if}
							</div>
						{/if}
						{#if viewMode === gen.id}
							<div class="absolute top-1 right-1 w-3 h-3 bg-yellow-500 rounded-full flex items-center justify-center">
								<Check class="w-2 h-2 text-zinc-900" />
							</div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Scroll Right -->
			{#if textureGenerations.length > 0}
				<button
					onclick={() => scrollHistory('right')}
					class="flex-shrink-0 p-1.5 hover:bg-zinc-800 rounded-lg transition-colors"
				>
					<ChevronRight class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-6">
		<!-- Left: 3D Preview -->
		<div class="order-2 lg:order-1">
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
				<div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
					<h2 class="text-sm font-medium text-white">3D Preview</h2>
					<div class="flex items-center gap-2">
						<!-- Shape selector -->
						<div class="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
							<button
								onclick={() => (previewShape = 'sphere')}
								class="p-1.5 rounded transition-colors {previewShape === 'sphere'
									? 'bg-yellow-500 text-zinc-900'
									: 'text-zinc-400 hover:text-white'}"
								title="Sphere"
							>
								<Circle class="w-4 h-4" />
							</button>
							<button
								onclick={() => (previewShape = 'cube')}
								class="p-1.5 rounded transition-colors {previewShape === 'cube'
									? 'bg-yellow-500 text-zinc-900'
									: 'text-zinc-400 hover:text-white'}"
								title="Cube"
							>
								<Box class="w-4 h-4" />
							</button>
							<button
								onclick={() => (previewShape = 'plane')}
								class="p-1.5 rounded transition-colors {previewShape === 'plane'
									? 'bg-yellow-500 text-zinc-900'
									: 'text-zinc-400 hover:text-white'}"
								title="Plane"
							>
								<Square class="w-4 h-4" />
							</button>
						</div>
						<!-- Auto-rotate toggle -->
						<button
							onclick={() => (autoRotate = !autoRotate)}
							class="p-1.5 rounded transition-colors {autoRotate
								? 'bg-yellow-500 text-zinc-900'
								: 'bg-zinc-800 text-zinc-400 hover:text-white'}"
							title="Auto-rotate"
						>
							<RotateCcw class="w-4 h-4" />
						</button>
					</div>
				</div>
				<div class="aspect-square bg-zinc-900">
					{#key viewMode}
						<Canvas>
							<MaterialPreview
								basecolorUrl={displayTextures.basecolor}
								normalUrl={displayTextures.normal}
								roughnessUrl={displayTextures.roughness}
								metallicUrl={displayTextures.metallic}
								heightUrl={displayTextures.height}
								shape={previewShape}
								{autoRotate}
							/>
						</Canvas>
					{/key}
				</div>
			</div>

			<!-- Texture Maps Grid -->
			{#if hasAnyTexture}
				<div class="mt-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-medium text-white">Generated Maps</h3>
						<button
							onclick={downloadAll}
							class="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-xs font-medium rounded-lg transition-colors"
						>
							<Download class="w-3.5 h-3.5" />
							Download All
						</button>
					</div>
					<div class="grid grid-cols-5 gap-2">
						{#each [
							{ key: 'basecolor', label: 'Color' },
							{ key: 'normal', label: 'Normal' },
							{ key: 'roughness', label: 'Rough' },
							{ key: 'metallic', label: 'Metal' },
							{ key: 'height', label: 'Height' },
						] as map}
							<div class="relative group">
								{#if displayTextures[map.key as keyof typeof displayTextures]}
									<img
										src={displayTextures[map.key as keyof typeof displayTextures]}
										alt={map.label}
										class="w-full aspect-square object-cover rounded-lg border border-zinc-700"
									/>
									<button
										onclick={() => downloadTexture(map.key as keyof typeof displayTextures)}
										class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
									>
										<Download class="w-4 h-4 text-white" />
									</button>
								{:else}
									<div class="w-full aspect-square bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
										<span class="text-xs text-zinc-500">-</span>
									</div>
								{/if}
								<p class="text-[10px] text-zinc-400 text-center mt-1">{map.label}</p>
							</div>
						{/each}
					</div>
				</div>
			{/if}
		</div>

		<!-- Right: Generation Form / Details -->
		<div class="order-1 lg:order-2">
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8">
				{#if viewMode === 'new'}
					<!-- New Generation Mode -->
					<h2 class="text-lg font-semibold text-white mb-4">Generate PBR Textures</h2>
					<p class="text-sm text-zinc-400 mb-6">
						Describe the material you want to create. We'll generate a complete set of PBR maps
						including basecolor, normal, roughness, metallic, and height.
					</p>

					<!-- Prompt -->
					<div class="mb-4">
						<label for="prompt" class="block text-sm font-medium text-zinc-400 mb-2">
							Material Description
						</label>
						<textarea
							id="prompt"
							bind:value={prompt}
							placeholder="e.g., weathered copper with green patina, brushed steel, rough concrete..."
							rows="4"
							class="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 resize-none"
						></textarea>
					</div>

					<!-- Example prompts -->
					<div class="mb-6">
						<p class="text-xs text-zinc-500 mb-2">Try these:</p>
						<div class="flex flex-wrap gap-2">
							{#each [
								'rusty metal plates',
								'polished marble',
								'worn leather',
								'old brick wall',
								'sci-fi panel',
							] as example}
								<button
									onclick={() => (prompt = example)}
									class="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
								>
									{example}
								</button>
							{/each}
						</div>
					</div>

					<!-- Status -->
					{#if status}
						<div class="mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
							<div class="flex items-center gap-2">
								<Loader2 class="w-4 h-4 animate-spin text-yellow-400" />
								<span class="text-sm text-yellow-300">{status}</span>
							</div>
						</div>
					{/if}

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
							Generate Textures ({TOKEN_COST} tokens)
						{/if}
					</button>

					<!-- Info -->
					<p class="mt-4 text-xs text-zinc-500 text-center">
						Generation creates 5 PBR maps: basecolor, normal, roughness, metallic, and height.
						Output resolution: 1024x1024
					</p>
				{:else if selectedGeneration}
					<!-- Viewing Existing Generation -->
					<div class="flex items-center justify-between mb-4">
						<h2 class="text-lg font-semibold text-white">
							{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
								Generating...
							{:else if selectedGeneration.status === 'completed'}
								Texture Complete
							{:else if selectedGeneration.status === 'failed'}
								Generation Failed
							{:else}
								Queued
							{/if}
						</h2>
						<span class="text-xs text-zinc-500">{formatDate(selectedGeneration.createdAt)}</span>
					</div>

					{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
						<!-- Progress View -->
						<div class="aspect-video bg-zinc-800/30 rounded-lg border border-zinc-700 flex flex-col items-center justify-center mb-4">
							<Loader2 class="w-12 h-12 animate-spin text-yellow-400 mb-4" />
							<p class="text-sm text-zinc-300 mb-2">{selectedGeneration.currentStage || 'Processing...'}</p>
							<div class="w-48 h-2 bg-zinc-700 rounded-full overflow-hidden">
								<div
									class="h-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all duration-500"
									style="width: {selectedGeneration.progress}%"
								></div>
							</div>
							<p class="text-xs text-zinc-500 mt-2">{selectedGeneration.progress}% complete</p>
						</div>
						<button
							onclick={() => cancelGeneration(selectedGeneration.id)}
							class="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-red-400 hover:text-red-300 rounded-lg transition-colors flex items-center justify-center gap-2"
						>
							<X class="w-4 h-4" />
							Cancel Generation
						</button>
					{:else if selectedGeneration.status === 'failed'}
						<!-- Error View -->
						<div class="aspect-video bg-red-500/5 rounded-lg border border-red-500/20 flex flex-col items-center justify-center mb-4 p-6">
							<X class="w-12 h-12 text-red-400 mb-4" />
							<p class="text-sm text-red-300 text-center mb-2">Generation failed</p>
							{#if selectedGeneration.errorMessage}
								<p class="text-xs text-red-400/70 text-center">{selectedGeneration.errorMessage}</p>
							{/if}
						</div>
						<button
							onclick={startNewGeneration}
							class="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
						>
							<Plus class="w-4 h-4" />
							Try Again
						</button>
					{:else if selectedGeneration.status === 'completed'}
						<!-- Completed View -->
						<div class="mb-4">
							<span class="text-xs text-zinc-500 mb-2 block">Prompt</span>
							<p class="text-sm text-white bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								{selectedGeneration.prompt}
							</p>
						</div>

						<!-- Info -->
						<div class="mb-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700">
							<div class="flex items-center justify-between text-sm">
								<span class="text-zinc-400">Token Cost</span>
								<span class="text-white font-medium">{selectedGeneration.tokenCost}</span>
							</div>
							{#if selectedGeneration.seed}
								<div class="flex items-center justify-between text-sm mt-2">
									<span class="text-zinc-400">Seed</span>
									<span class="text-white font-medium">{selectedGeneration.seed}</span>
								</div>
							{/if}
						</div>

						<!-- Actions -->
						<div class="flex gap-2">
							<button
								onclick={downloadAll}
								class="flex-1 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-medium rounded-lg transition-colors flex items-center justify-center gap-2"
							>
								<Download class="w-4 h-4" />
								Download All
							</button>
							<button
								onclick={startNewGeneration}
								class="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
							>
								<Plus class="w-4 h-4" />
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>
