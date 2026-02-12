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
import { track } from '@vercel/analytics';
import MaterialPreview from '$lib/components/three/MaterialPreview.svelte';
import { PRICING } from '$lib/pricing';
import type { TextureGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialGenerations = data.textureGenerations;

// svelte-ignore state_referenced_locally
let tokens = $state(data.user?.tokens ?? 0);
// svelte-ignore state_referenced_locally
let bonusTokens = $state(data.user?.bonusTokens ?? 0);

let viewMode = $state<'new' | string>(
	initialGenerations.length > 0 ? initialGenerations[0].id : 'new',
);

let prompt = $state('');
let generating = $state(false);
let currentGeneratingId = $state<string | null>(null);

let previewShape = $state<'sphere' | 'cube' | 'plane'>('sphere');
let autoRotate = $state(true);

let textureGenerations = $state<TextureGeneration[]>(initialGenerations);

const pollingSet = new Set<string>();

let status = $state<string | null>(null);

const TOKEN_COST = PRICING.tokenCosts.texture;

const selectedGeneration = $derived(
	viewMode !== 'new' ? textureGenerations.find((g) => g.id === viewMode) : null,
);

const displayTextures = $derived(
	selectedGeneration
		? {
				basecolor: selectedGeneration.basecolorUrl,
				normal: selectedGeneration.normalUrl,
				roughness: selectedGeneration.roughnessUrl,
				metallic: selectedGeneration.metallicUrl,
			}
		: {
				basecolor: null,
				normal: null,
				roughness: null,
				metallic: null,
			},
);

const hasAnyTexture = $derived(
	Object.values(displayTextures).some((v) => v !== null),
);

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

		track('generation_started', { type: 'texture' });

		if (result.id) {
			const newGen: TextureGeneration = {
				id: result.id,
				userId: data.user?.id ?? '',
				prompt: prompt.trim(),
				status: 'pending',
				progress: 0,
				currentStage: null,
				runpodJobId: null,
				basecolorUrl: null,
				normalUrl: null,
				roughnessUrl: null,
				metallicUrl: null,
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

		textureGenerations = textureGenerations.map((g) =>
			g.id === id
				? { ...g, status: 'failed', errorMessage: 'Cancelled by user' }
				: g,
		);

		tokens = tokens + result.regularTokensRefunded;
		bonusTokens = bonusTokens + result.bonusTokensRefunded;

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
	let retryCount = 0;
	const maxRetries = 5;

	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/textures/${id}/status`);
			if (!res.ok) {
				retryCount++;
				if (retryCount < maxRetries) {
					await new Promise((r) => setTimeout(r, 2000));
					return poll();
				}
				pollingSet.delete(id);
				if (currentGeneratingId === id) {
					generating = false;
					currentGeneratingId = null;
					status = null;
				}
				return;
			}

			retryCount = 0;

			const result = await res.json();
			status = result.statusMessage || result.status;

			textureGenerations = textureGenerations.map((g) =>
				g.id === id
					? {
							...g,
							status: result.status,
							progress: result.progress || 0,
							currentStage: result.statusMessage,
							runpodJobId: result.runpodJobId || g.runpodJobId,
							basecolorUrl: result.textures?.basecolor || g.basecolorUrl,
							normalUrl: result.textures?.normal || g.normalUrl,
							roughnessUrl: result.textures?.roughness || g.roughnessUrl,
							metallicUrl: result.textures?.metallic || g.metallicUrl,
						}
					: g,
			);

			if (result.status === 'completed') {
				pollingSet.delete(id);
				tokens = result.tokensRemaining ?? tokens;
				bonusTokens = result.bonusTokensRemaining ?? bonusTokens;

				track('generation_completed', { type: 'texture' });

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
				if (result.error && !result.error.includes('Cancelled by user')) {
					alert(result.error);
				}
				return;
			}

			await new Promise((r) => setTimeout(r, 2000));
			return poll();
		} catch {
			retryCount++;
			if (retryCount < maxRetries) {
				await new Promise((r) => setTimeout(r, 2000));
				return poll();
			}
			pollingSet.delete(id);
			if (currentGeneratingId === id) {
				generating = false;
				currentGeneratingId = null;
				status = null;
			}
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
	<div class="history-bar">
		<div class="flex items-center gap-2">
			<button
				onclick={startNewGeneration}
				class="history-new {viewMode === 'new' ? 'history-new-active' : ''}"
			>
				<Plus class="w-6 h-6 {viewMode === 'new' ? 'text-amber-400' : 'text-zinc-500'}" />
			</button>

			{#if textureGenerations.length > 0}
				<button
					onclick={() => scrollHistory('left')}
					class="flex-shrink-0 p-1.5 hover:bg-zinc-800/60 rounded-lg transition-colors"
				>
					<ChevronLeft class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}

			<div
				bind:this={historyScrollContainer}
				class="flex-1 flex gap-2 overflow-x-auto scrollbar-hide"
				style="scrollbar-width: none; -ms-overflow-style: none;"
			>
				{#each textureGenerations as gen (gen.id)}
					<button
						onclick={() => selectGeneration(gen.id)}
						class="history-thumb {viewMode === gen.id ? 'history-thumb-active' : ''}"
					>
						{#if gen.status === 'completed'}
							{#if gen.basecolorUrl}
								<img
									src={gen.basecolorUrl}
									alt={gen.prompt}
									class="w-full h-full object-cover bg-zinc-800"
								/>
							{:else}
								<div class="w-full h-full bg-zinc-800 flex items-center justify-center">
									<Check class="w-5 h-5 text-green-400" />
								</div>
							{/if}
						{:else if gen.status === 'failed'}
							<div class="w-full h-full bg-zinc-800 flex items-center justify-center">
								<X class="w-5 h-5 text-red-400" />
							</div>
						{:else}
							<div class="w-full h-full bg-zinc-800 flex flex-col items-center justify-center">
								<Loader2 class="w-5 h-5 animate-spin text-amber-400" />
							</div>
						{/if}
						{#if viewMode === gen.id}
							<div class="absolute top-1 right-1 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
								<Check class="w-2 h-2 text-zinc-900" />
							</div>
						{/if}
					</button>
				{/each}
			</div>

			{#if textureGenerations.length > 0}
				<button
					onclick={() => scrollHistory('right')}
					class="flex-shrink-0 p-1.5 hover:bg-zinc-800/60 rounded-lg transition-colors"
				>
					<ChevronRight class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="flex-1 grid grid-cols-1 lg:grid-cols-2 gap-5">
		<!-- Left: 3D Preview -->
		<div class="order-2 lg:order-1">
			<div class="preview-panel">
				<div class="preview-header">
					<h2 class="text-sm font-medium text-white">3D Preview</h2>
					<div class="flex items-center gap-2">
						<div class="shape-toggle">
							<button
								onclick={() => (previewShape = 'sphere')}
								class="shape-btn {previewShape === 'sphere' ? 'shape-btn-active' : ''}"
								title="Sphere"
							>
								<Circle class="w-4 h-4" />
							</button>
							<button
								onclick={() => (previewShape = 'cube')}
								class="shape-btn {previewShape === 'cube' ? 'shape-btn-active' : ''}"
								title="Cube"
							>
								<Box class="w-4 h-4" />
							</button>
							<button
								onclick={() => (previewShape = 'plane')}
								class="shape-btn {previewShape === 'plane' ? 'shape-btn-active' : ''}"
								title="Plane"
							>
								<Square class="w-4 h-4" />
							</button>
						</div>
						<button
							onclick={() => (autoRotate = !autoRotate)}
							class="shape-btn {autoRotate ? 'shape-btn-active' : ''}"
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
								shape={previewShape}
								{autoRotate}
							/>
						</Canvas>
					{/key}
				</div>
			</div>

			<!-- Texture Maps Grid -->
			{#if hasAnyTexture}
				<div class="maps-panel">
					<div class="flex items-center justify-between mb-3">
						<h3 class="text-sm font-medium text-white">Generated Maps</h3>
						<button onclick={downloadAll} class="btn-sm btn-sm-gold">
							<Download class="w-3.5 h-3.5" />
							Download All
						</button>
					</div>
					<div class="grid grid-cols-4 gap-2">
						{#each [
							{ key: 'basecolor', label: 'Color' },
							{ key: 'normal', label: 'Normal' },
							{ key: 'roughness', label: 'Rough' },
							{ key: 'metallic', label: 'Metal' },
						] as map}
							<div class="relative group">
								{#if displayTextures[map.key as keyof typeof displayTextures]}
									<img
										src={displayTextures[map.key as keyof typeof displayTextures]}
										alt={map.label}
										class="w-full aspect-square object-cover rounded-lg border border-zinc-700/50"
									/>
									<button
										onclick={() => downloadTexture(map.key as keyof typeof displayTextures)}
										class="absolute inset-0 bg-black/55 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
									>
										<Download class="w-4 h-4 text-white" />
									</button>
								{:else}
									<div class="w-full aspect-square bg-zinc-800/40 rounded-lg border border-zinc-700/40 flex items-center justify-center">
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
			<div class="panel sticky top-20">
				{#if viewMode === 'new'}
					<h2 class="panel-title">Generate PBR Textures</h2>
					<p class="text-sm text-zinc-400 mb-5">
						Describe the material you want to create. We'll generate a complete set of PBR maps
						including basecolor, normal, roughness, and metallic.
					</p>

					<div class="mb-4">
						<label for="prompt" class="field-label">Material Description</label>
						<textarea
							id="prompt"
							bind:value={prompt}
							placeholder="e.g., weathered copper with green patina, brushed steel, rough concrete..."
							rows="4"
							class="field-textarea"
						></textarea>
					</div>

					<div class="mb-5">
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
									class="example-chip"
								>
									{example}
								</button>
							{/each}
						</div>
					</div>

					{#if status}
						<div class="mb-4 px-3 py-2 bg-amber-500/6 border border-amber-500/15 rounded-xl">
							<div class="flex items-center gap-2">
								<Loader2 class="w-4 h-4 animate-spin text-amber-400" />
								<span class="text-sm text-amber-300">{status}</span>
							</div>
						</div>
					{/if}

					<button
						onclick={generate}
						disabled={!prompt.trim() || generating || tokens + bonusTokens < TOKEN_COST}
						class="btn-generate"
					>
						{#if generating}
							<Loader2 class="w-4 h-4 animate-spin" />
							Generating...
						{:else}
							<Sparkles class="w-4 h-4" />
							Generate Textures ({TOKEN_COST} tokens)
						{/if}
					</button>

					<p class="mt-4 text-xs text-zinc-500 text-center">
						Generation creates 4 PBR maps: basecolor, normal, roughness, and metallic.
						Output resolution: 1024&times;1024
					</p>
				{:else if selectedGeneration}
					<div class="flex items-center justify-between mb-4">
						<h2 class="panel-title" style="margin-bottom:0">
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

					{#if selectedGeneration.runpodJobId}
						<div class="mb-3 text-xs text-zinc-500 font-mono">
							Job: {selectedGeneration.runpodJobId}
						</div>
					{/if}

					{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
						<div class="aspect-video bg-zinc-800/25 rounded-xl border border-zinc-700/40 flex flex-col items-center justify-center mb-4">
							<Loader2 class="w-12 h-12 animate-spin text-amber-400 mb-4" />
							<p class="text-sm text-zinc-300">{selectedGeneration.currentStage || 'Processing...'}</p>
						</div>
						<button
							onclick={() => cancelGeneration(selectedGeneration.id)}
							class="btn-cancel"
						>
							<X class="w-4 h-4" />
							Cancel Generation
						</button>
					{:else if selectedGeneration.status === 'failed'}
						<div class="aspect-video bg-red-500/5 rounded-xl border border-red-500/15 flex flex-col items-center justify-center mb-4 p-6">
							<X class="w-12 h-12 text-red-400 mb-4" />
							<p class="text-sm text-red-300 text-center mb-2">Generation failed</p>
							{#if selectedGeneration.errorMessage}
								<p class="text-xs text-red-400/70 text-center">{selectedGeneration.errorMessage}</p>
							{/if}
						</div>
						<button onclick={startNewGeneration} class="btn-secondary w-full">
							<Plus class="w-4 h-4" />
							Try Again
						</button>
					{:else if selectedGeneration.status === 'completed'}
						<div class="mb-4">
							<span class="text-xs text-zinc-500 mb-2 block">Prompt</span>
							<p class="text-sm text-white bg-zinc-800/40 rounded-xl p-3 border border-zinc-700/50">
								{selectedGeneration.prompt}
							</p>
						</div>

						<div class="mb-4 p-3 bg-zinc-800/25 rounded-xl border border-zinc-700/40">
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

						<div class="flex gap-2">
							<button onclick={downloadAll} class="btn-download flex-1">
								<Download class="w-4 h-4" />
								Download All
							</button>
							<button onclick={startNewGeneration} class="btn-secondary px-4">
								<Plus class="w-4 h-4" />
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>

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
		font-weight: 700; font-size: 1.05rem;
		color: #fff; margin-bottom: 1rem;
	}

	/* History bar */
	.history-bar {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .85rem;
		padding: .65rem;
		backdrop-filter: blur(6px);
	}
	.history-new {
		flex-shrink: 0; width: 4rem; height: 4rem;
		border-radius: .6rem;
		border: 2px dashed rgba(63,63,70,.5);
		display: flex; align-items: center; justify-content: center;
		background: none; cursor: pointer;
		transition: border-color .2s, background .2s;
	}
	.history-new:hover { border-color: rgba(63,63,70,.7); }
	.history-new-active {
		border-color: rgba(245,158,11,.5);
		background: rgba(245,158,11,.06);
	}
	.history-thumb {
		flex-shrink: 0; position: relative;
		width: 4rem; height: 4rem;
		border-radius: .6rem; overflow: hidden;
		border: 2px solid rgba(63,63,70,.4);
		background: none; cursor: pointer;
		transition: border-color .2s;
	}
	.history-thumb:hover { border-color: rgba(63,63,70,.6); }
	.history-thumb-active { border-color: rgba(245,158,11,.5); }

	/* 3D Preview panel */
	.preview-panel {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		overflow: hidden;
		backdrop-filter: blur(6px);
	}
	.preview-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: .75rem 1rem;
		border-bottom: 1px solid rgba(63,63,70,.25);
	}
	.shape-toggle {
		display: flex; align-items: center; gap: .2rem;
		background: rgba(39,39,42,.5);
		border-radius: .45rem;
		padding: .15rem;
	}
	.shape-btn {
		padding: .35rem;
		border-radius: .35rem;
		border: none; cursor: pointer;
		color: #71717a;
		background: none;
		transition: color .2s, background .2s;
	}
	.shape-btn:hover { color: #fff; }
	.shape-btn-active {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
	}

	/* Maps panel */
	.maps-panel {
		margin-top: 1rem;
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		padding: 1rem;
		backdrop-filter: blur(6px);
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

	/* Example chips */
	.example-chip {
		padding: .25rem .55rem;
		font-size: .72rem;
		background: rgba(39,39,42,.4);
		border: none; border-radius: .35rem;
		color: #d4d4d8; cursor: pointer;
		transition: background .2s;
	}
	.example-chip:hover { background: rgba(63,63,70,.5); }

	/* Buttons */
	.btn-generate {
		width: 100%;
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		padding: .75rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600; font-size: .875rem;
		border-radius: .7rem;
		border: none; cursor: pointer;
		box-shadow: 0 0 20px rgba(245,158,11,.15);
		transition: box-shadow .25s, transform .15s, opacity .2s;
	}
	.btn-generate:hover:not(:disabled) {
		box-shadow: 0 0 28px rgba(245,158,11,.28);
		transform: translateY(-1px);
	}
	.btn-generate:disabled {
		background: rgba(63,63,70,.4);
		color: #71717a; cursor: not-allowed; box-shadow: none;
	}

	.btn-secondary {
		display: flex; align-items: center; justify-content: center; gap: .4rem;
		padding: .6rem 1rem;
		background: rgba(63,63,70,.3);
		color: #fff; font-size: .8125rem; font-weight: 500;
		border-radius: .55rem; border: none; cursor: pointer;
		transition: background .2s;
	}
	.btn-secondary:hover { background: rgba(63,63,70,.5); }

	.btn-cancel {
		width: 100%;
		display: flex; align-items: center; justify-content: center; gap: .4rem;
		padding: .6rem 1rem;
		background: rgba(63,63,70,.3);
		color: #f87171; font-size: .875rem; font-weight: 500;
		border-radius: .55rem; border: none; cursor: pointer;
		transition: background .2s, color .2s;
	}
	.btn-cancel:hover { background: rgba(239,68,68,.1); color: #fca5a5; }

	.btn-download {
		display: flex; align-items: center; justify-content: center; gap: .4rem;
		padding: .6rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-weight: 600; font-size: .8125rem;
		border-radius: .55rem; border: none; cursor: pointer;
		transition: box-shadow .2s;
	}
	.btn-download:hover { box-shadow: 0 0 16px rgba(245,158,11,.2); }

	.btn-sm {
		display: flex; align-items: center; gap: .35rem;
		padding: .35rem .65rem;
		background: rgba(63,63,70,.3);
		color: #fff; font-size: .72rem; font-weight: 500;
		border-radius: .45rem; border: none; cursor: pointer;
		transition: background .2s;
	}
	.btn-sm:hover { background: rgba(63,63,70,.5); }
	.btn-sm-gold {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-weight: 600;
	}
	.btn-sm-gold:hover { box-shadow: 0 0 12px rgba(245,158,11,.2); }
</style>
