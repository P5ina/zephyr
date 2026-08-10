<script lang="ts">
	import { Canvas } from '@threlte/core';
	import { track } from '@vercel/analytics';
	import JSZip from 'jszip';
	import {
		Box,
		Check,
		ChevronLeft,
		ChevronRight,
		Circle,
		Download,
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
	import { tokenState } from '$lib/token-state.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const initialGenerations = data.textureGenerations;

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
		viewMode !== 'new'
			? textureGenerations.find((g) => g.id === viewMode)
			: null,
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
		if (tokenState.total < TOKEN_COST) {
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
			tokenState.tokens = result.tokensRemaining ?? tokenState.tokens;
			tokenState.bonusTokens =
				result.bonusTokensRemaining ?? tokenState.bonusTokens;

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
		if (!confirm('Cancel this generation? Your tokens will be refunded.'))
			return;

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

			tokenState.tokens = tokenState.tokens + result.regularTokensRefunded;
			tokenState.bonusTokens =
				tokenState.bonusTokens + result.bonusTokensRefunded;

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
					tokenState.tokens = result.tokensRemaining ?? tokenState.tokens;
					tokenState.bonusTokens =
						result.bonusTokensRemaining ?? tokenState.bonusTokens;

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

	let downloading = $state(false);

	async function fetchAsBlob(url: string): Promise<Blob> {
		const res = await fetch(url);
		return res.blob();
	}

	async function downloadTexture(type: keyof typeof displayTextures) {
		const url = displayTextures[type];
		if (!url) return;

		const name = selectedGeneration?.prompt || prompt;
		try {
			const blob = await fetchAsBlob(url);
			const blobUrl = URL.createObjectURL(blob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${name.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${type}.png`;
			a.click();
			URL.revokeObjectURL(blobUrl);
		} catch {
			window.open(url, '_blank');
		}
	}

	async function downloadAll() {
		downloading = true;
		try {
			const name =
				(selectedGeneration?.prompt || prompt)
					.slice(0, 30)
					.replace(/[^a-z0-9]/gi, '_') || 'textures';
			const zip = new JSZip();
			const entries = Object.entries(displayTextures) as [
				string,
				string | null,
			][];
			await Promise.all(
				entries
					.filter((entry): entry is [string, string] => !!entry[1])
					.map(async ([type, url]) => {
						const blob = await fetchAsBlob(url);
						zip.file(`${name}_${type}.png`, blob);
					}),
			);
			const zipBlob = await zip.generateAsync({ type: 'blob' });
			const blobUrl = URL.createObjectURL(zipBlob);
			const a = document.createElement('a');
			a.href = blobUrl;
			a.download = `${name}_pbr.zip`;
			a.click();
			URL.revokeObjectURL(blobUrl);
		} catch {
			alert('Failed to download. Please try again.');
		} finally {
			downloading = false;
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

<div class="flex h-full flex-col gap-4">
	<!-- History Bar -->
	<div class="history-bar">
		<div class="flex items-center gap-2">
			<button
				onclick={startNewGeneration}
				class="history-new {viewMode === 'new' ? 'history-new-active' : ''}"
			>
				<Plus
					class="h-6 w-6 {viewMode === 'new'
						? 'text-amber-400'
						: 'text-zinc-500'}"
				/>
			</button>

			{#if textureGenerations.length > 0}
				<button
					onclick={() => scrollHistory('left')}
					class="flex-shrink-0 rounded-lg p-1.5 transition-colors hover:bg-zinc-800/60"
				>
					<ChevronLeft class="h-4 w-4 text-zinc-400" />
				</button>
			{/if}

			<div
				bind:this={historyScrollContainer}
				class="scrollbar-hide flex flex-1 gap-2 overflow-x-auto"
				style="scrollbar-width: none; -ms-overflow-style: none;"
			>
				{#each textureGenerations as gen (gen.id)}
					<button
						onclick={() => selectGeneration(gen.id)}
						class="history-thumb {viewMode === gen.id
							? 'history-thumb-active'
							: ''}"
					>
						{#if gen.status === 'completed'}
							{#if gen.basecolorUrl}
								<img
									src={gen.basecolorUrl}
									alt={gen.prompt}
									class="h-full w-full bg-zinc-800 object-cover"
								/>
							{:else}
								<div
									class="flex h-full w-full items-center justify-center bg-zinc-800"
								>
									<Check class="h-5 w-5 text-green-400" />
								</div>
							{/if}
						{:else if gen.status === 'failed'}
							<div
								class="flex h-full w-full items-center justify-center bg-zinc-800"
							>
								<X class="h-5 w-5 text-red-400" />
							</div>
						{:else}
							<div
								class="flex h-full w-full flex-col items-center justify-center bg-zinc-800"
							>
								<Loader2 class="h-5 w-5 animate-spin text-amber-400" />
							</div>
						{/if}
						{#if viewMode === gen.id}
							<div
								class="absolute top-1 right-1 flex h-3 w-3 items-center justify-center rounded-full bg-amber-500"
							>
								<Check class="h-2 w-2 text-zinc-900" />
							</div>
						{/if}
					</button>
				{/each}
			</div>

			{#if textureGenerations.length > 0}
				<button
					onclick={() => scrollHistory('right')}
					class="flex-shrink-0 rounded-lg p-1.5 transition-colors hover:bg-zinc-800/60"
				>
					<ChevronRight class="h-4 w-4 text-zinc-400" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-2">
		<!-- Left: 3D Preview -->
		<div class="order-2 lg:order-1">
			<div class="preview-panel">
				<div class="preview-header">
					<h2 class="text-sm font-medium text-white">3D Preview</h2>
					<div class="flex items-center gap-2">
						<div class="shape-toggle">
							<button
								onclick={() => (previewShape = 'sphere')}
								class="shape-btn {previewShape === 'sphere'
									? 'shape-btn-active'
									: ''}"
								title="Sphere"
							>
								<Circle class="h-4 w-4" />
							</button>
							<button
								onclick={() => (previewShape = 'cube')}
								class="shape-btn {previewShape === 'cube'
									? 'shape-btn-active'
									: ''}"
								title="Cube"
							>
								<Box class="h-4 w-4" />
							</button>
							<button
								onclick={() => (previewShape = 'plane')}
								class="shape-btn {previewShape === 'plane'
									? 'shape-btn-active'
									: ''}"
								title="Plane"
							>
								<Square class="h-4 w-4" />
							</button>
						</div>
						<button
							onclick={() => (autoRotate = !autoRotate)}
							class="shape-btn {autoRotate ? 'shape-btn-active' : ''}"
							title="Auto-rotate"
						>
							<RotateCcw class="h-4 w-4" />
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
					<div class="mb-3 flex items-center justify-between">
						<h3 class="text-sm font-medium text-white">Generated Maps</h3>
					</div>
					<div class="grid grid-cols-4 gap-2">
						{#each [{ key: 'basecolor', label: 'Color' }, { key: 'normal', label: 'Normal' }, { key: 'roughness', label: 'Rough' }, { key: 'metallic', label: 'Metal' }] as map (map.key)}
							<div class="group relative">
								{#if displayTextures[map.key as keyof typeof displayTextures]}
									<img
										src={displayTextures[
											map.key as keyof typeof displayTextures
										]}
										alt={map.label}
										class="aspect-square w-full rounded-lg border border-zinc-700/50 object-cover"
									/>
									<button
										onclick={() =>
											downloadTexture(map.key as keyof typeof displayTextures)}
										class="absolute inset-0 flex items-center justify-center rounded-lg bg-black/55 opacity-0 transition-opacity group-hover:opacity-100"
									>
										<Download class="h-4 w-4 text-white" />
									</button>
								{:else}
									<div
										class="flex aspect-square w-full items-center justify-center rounded-lg border border-zinc-700/40 bg-zinc-800/40"
									>
										<span class="text-xs text-zinc-500">-</span>
									</div>
								{/if}
								<p class="mt-1 text-center text-[10px] text-zinc-400">
									{map.label}
								</p>
							</div>
						{/each}
					</div>
					<button
						onclick={downloadAll}
						disabled={downloading}
						class="btn-download-all"
					>
						{#if downloading}
							<Loader2 class="h-4 w-4 animate-spin" />
							Preparing zip...
						{:else}
							<Download class="h-4 w-4" />
							Download All
						{/if}
					</button>
				</div>
			{/if}
		</div>

		<!-- Right: Generation Form / Details -->
		<div class="order-1 lg:order-2">
			<div class="panel sticky top-20">
				{#if viewMode === 'new'}
					<h2 class="panel-title">Generate PBR Textures</h2>
					<p class="mb-5 text-sm text-zinc-400">
						Describe the material you want to create. We'll generate a complete
						set of PBR maps including basecolor, normal, roughness, and
						metallic.
					</p>

					<div class="mb-4">
						<label for="prompt" class="field-label">Material Description</label>
						<textarea
							id="prompt"
							bind:value={prompt}
							placeholder="e.g., weathered copper with green patina, brushed steel, rough concrete..."
							rows="4"
							class="field-textarea"></textarea>
					</div>

					<div class="mb-5">
						<p class="mb-2 text-xs text-zinc-500">Try these:</p>
						<div class="flex flex-wrap gap-2">
							{#each ['rusty metal plates', 'polished marble', 'worn leather', 'old brick wall', 'sci-fi panel'] as example (example)}
								<button onclick={() => (prompt = example)} class="example-chip">
									{example}
								</button>
							{/each}
						</div>
					</div>

					{#if status}
						<div
							class="mb-4 rounded-xl border border-amber-500/15 bg-amber-500/6 px-3 py-2"
						>
							<div class="flex items-center gap-2">
								<Loader2 class="h-4 w-4 animate-spin text-amber-400" />
								<span class="text-sm text-amber-300">{status}</span>
							</div>
						</div>
					{/if}

					<button
						onclick={generate}
						disabled={!prompt.trim() ||
							generating ||
							tokenState.total < TOKEN_COST}
						class="btn-generate"
					>
						{#if generating}
							<Loader2 class="h-4 w-4 animate-spin" />
							Generating...
						{:else}
							<Sparkles class="h-4 w-4" />
							Generate Textures ({TOKEN_COST} tokens)
						{/if}
					</button>

					<p class="mt-4 text-center text-xs text-zinc-500">
						Generation creates 4 PBR maps: basecolor, normal, roughness, and
						metallic. Output resolution: 1024&times;1024
					</p>
				{:else if selectedGeneration}
					<div class="mb-4 flex items-center justify-between">
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
						<span class="text-xs text-zinc-500"
							>{formatDate(selectedGeneration.createdAt)}</span
						>
					</div>

					{#if selectedGeneration.runpodJobId}
						<div class="mb-3 font-mono text-xs text-zinc-500">
							Job: {selectedGeneration.runpodJobId}
						</div>
					{/if}

					{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
						<div
							class="mb-4 flex aspect-video flex-col items-center justify-center rounded-xl border border-zinc-700/40 bg-zinc-800/25"
						>
							<Loader2 class="mb-4 h-12 w-12 animate-spin text-amber-400" />
							<p class="text-sm text-zinc-300">
								{selectedGeneration.currentStage || 'Processing...'}
							</p>
						</div>
						<button
							onclick={() => cancelGeneration(selectedGeneration.id)}
							class="btn-cancel"
						>
							<X class="h-4 w-4" />
							Cancel Generation
						</button>
					{:else if selectedGeneration.status === 'failed'}
						<div
							class="mb-4 flex aspect-video flex-col items-center justify-center rounded-xl border border-red-500/15 bg-red-500/5 p-6"
						>
							<X class="mb-4 h-12 w-12 text-red-400" />
							<p class="mb-2 text-center text-sm text-red-300">
								Generation failed
							</p>
							{#if selectedGeneration.errorMessage}
								<p class="text-center text-xs text-red-400/70">
									{selectedGeneration.errorMessage}
								</p>
							{/if}
						</div>
						<button onclick={startNewGeneration} class="btn-secondary w-full">
							<Plus class="h-4 w-4" />
							Try Again
						</button>
					{:else if selectedGeneration.status === 'completed'}
						<div class="mb-4">
							<span class="mb-2 block text-xs text-zinc-500">Prompt</span>
							<p
								class="rounded-xl border border-zinc-700/50 bg-zinc-800/40 p-3 text-sm text-white"
							>
								{selectedGeneration.prompt}
							</p>
						</div>

						<div
							class="mb-4 rounded-xl border border-zinc-700/40 bg-zinc-800/25 p-3"
						>
							<div class="flex items-center justify-between text-sm">
								<span class="text-zinc-400">Token Cost</span>
								<span class="font-medium text-white"
									>{selectedGeneration.tokenCost}</span
								>
							</div>
							{#if selectedGeneration.seed}
								<div class="mt-2 flex items-center justify-between text-sm">
									<span class="text-zinc-400">Seed</span>
									<span class="font-medium text-white"
										>{selectedGeneration.seed}</span
									>
								</div>
							{/if}
						</div>

						<button onclick={startNewGeneration} class="btn-secondary w-full">
							<Plus class="h-4 w-4" />
							New Texture
						</button>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* Panels */
	.panel {
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.35);
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

	/* History bar */
	.history-bar {
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.35);
		border-radius: 0.85rem;
		padding: 0.65rem;
		backdrop-filter: blur(6px);
	}
	.history-new {
		flex-shrink: 0;
		width: 4rem;
		height: 4rem;
		border-radius: 0.6rem;
		border: 2px dashed rgba(63, 63, 70, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		background: none;
		cursor: pointer;
		transition:
			border-color 0.2s,
			background 0.2s;
	}
	.history-new:hover {
		border-color: rgba(63, 63, 70, 0.7);
	}
	.history-new-active {
		border-color: rgba(245, 158, 11, 0.5);
		background: rgba(245, 158, 11, 0.06);
	}
	.history-thumb {
		flex-shrink: 0;
		position: relative;
		width: 4rem;
		height: 4rem;
		border-radius: 0.6rem;
		overflow: hidden;
		border: 2px solid rgba(63, 63, 70, 0.4);
		background: none;
		cursor: pointer;
		transition: border-color 0.2s;
	}
	.history-thumb:hover {
		border-color: rgba(63, 63, 70, 0.6);
	}
	.history-thumb-active {
		border-color: rgba(245, 158, 11, 0.5);
	}

	/* 3D Preview panel */
	.preview-panel {
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.35);
		border-radius: 1rem;
		overflow: hidden;
		backdrop-filter: blur(6px);
	}
	.preview-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid rgba(63, 63, 70, 0.25);
	}
	.shape-toggle {
		display: flex;
		align-items: center;
		gap: 0.2rem;
		background: rgba(39, 39, 42, 0.5);
		border-radius: 0.45rem;
		padding: 0.15rem;
	}
	.shape-btn {
		padding: 0.35rem;
		border-radius: 0.35rem;
		border: none;
		cursor: pointer;
		color: #71717a;
		background: none;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.shape-btn:hover {
		color: #fff;
	}
	.shape-btn-active {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
	}

	/* Download All */
	.btn-download-all {
		width: 100%;
		margin-top: 0.85rem;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.7rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600;
		font-size: 0.875rem;
		border-radius: 0.65rem;
		border: none;
		cursor: pointer;
		box-shadow: 0 0 20px rgba(245, 158, 11, 0.12);
		transition:
			box-shadow 0.25s,
			transform 0.15s;
	}
	.btn-download-all:hover:not(:disabled) {
		box-shadow: 0 0 28px rgba(245, 158, 11, 0.25);
		transform: translateY(-1px);
	}
	.btn-download-all:disabled {
		opacity: 0.7;
		cursor: wait;
	}

	/* Maps panel */
	.maps-panel {
		margin-top: 1rem;
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.35);
		border-radius: 1rem;
		padding: 1rem;
		backdrop-filter: blur(6px);
	}

	/* Form fields */
	.field-label {
		display: block;
		font-size: 0.8125rem;
		font-weight: 500;
		color: #a1a1aa;
		margin-bottom: 0.5rem;
	}
	.field-textarea {
		width: 100%;
		padding: 0.6rem 0.75rem;
		background: rgba(39, 39, 42, 0.4);
		border: 1px solid rgba(63, 63, 70, 0.5);
		border-radius: 0.65rem;
		color: #fff;
		font-size: 0.875rem;
		resize: none;
		transition:
			border-color 0.2s,
			box-shadow 0.2s;
	}
	.field-textarea::placeholder {
		color: #52525b;
	}
	.field-textarea:focus {
		outline: none;
		border-color: rgba(245, 158, 11, 0.35);
		box-shadow: 0 0 0 3px rgba(245, 158, 11, 0.08);
	}

	/* Example chips */
	.example-chip {
		padding: 0.25rem 0.55rem;
		font-size: 0.72rem;
		background: rgba(39, 39, 42, 0.4);
		border: none;
		border-radius: 0.35rem;
		color: #d4d4d8;
		cursor: pointer;
		transition: background 0.2s;
	}
	.example-chip:hover {
		background: rgba(63, 63, 70, 0.5);
	}

	/* Buttons */
	.btn-generate {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.5rem;
		padding: 0.75rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600;
		font-size: 0.875rem;
		border-radius: 0.7rem;
		border: none;
		cursor: pointer;
		box-shadow: 0 0 20px rgba(245, 158, 11, 0.15);
		transition:
			box-shadow 0.25s,
			transform 0.15s,
			opacity 0.2s;
	}
	.btn-generate:hover:not(:disabled) {
		box-shadow: 0 0 28px rgba(245, 158, 11, 0.28);
		transform: translateY(-1px);
	}
	.btn-generate:disabled {
		background: rgba(63, 63, 70, 0.4);
		color: #71717a;
		cursor: not-allowed;
		box-shadow: none;
	}

	.btn-secondary {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		background: rgba(63, 63, 70, 0.3);
		color: #fff;
		font-size: 0.8125rem;
		font-weight: 500;
		border-radius: 0.55rem;
		border: none;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-secondary:hover {
		background: rgba(63, 63, 70, 0.5);
	}

	.btn-cancel {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		background: rgba(63, 63, 70, 0.3);
		color: #f87171;
		font-size: 0.875rem;
		font-weight: 500;
		border-radius: 0.55rem;
		border: none;
		cursor: pointer;
		transition:
			background 0.2s,
			color 0.2s;
	}
	.btn-cancel:hover {
		background: rgba(239, 68, 68, 0.1);
		color: #fca5a5;
	}

	.btn-download {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		padding: 0.6rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600;
		font-size: 0.8125rem;
		border-radius: 0.55rem;
		border: none;
		cursor: pointer;
		transition: box-shadow 0.2s;
	}
	.btn-download:hover {
		box-shadow: 0 0 16px rgba(245, 158, 11, 0.2);
	}

	.btn-sm {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.35rem 0.65rem;
		background: rgba(63, 63, 70, 0.3);
		color: #fff;
		font-size: 0.72rem;
		font-weight: 500;
		border-radius: 0.45rem;
		border: none;
		cursor: pointer;
		transition: background 0.2s;
	}
	.btn-sm:hover {
		background: rgba(63, 63, 70, 0.5);
	}
	.btn-sm-gold {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600;
	}
	.btn-sm-gold:hover {
		box-shadow: 0 0 12px rgba(245, 158, 11, 0.2);
	}
</style>
