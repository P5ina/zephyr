<script lang="ts">
	import { track } from '@vercel/analytics';
	import {
		Check,
		ChevronLeft,
		ChevronRight,
		Download,
		ImagePlus,
		Layers,
		Loader2,
		Plus,
		Sparkles,
		X,
		Zap,
	} from 'lucide-svelte';
	import { slide } from 'svelte/transition';
	import { uploadImageToBlob } from '$lib/blob-upload';
	import { PRICING } from '$lib/pricing';
	import type { ConceptArtGeneration } from '$lib/server/db/schema';
	import { tokenState } from '$lib/token-state.svelte';
	import type { PageData } from './$types';

	let { data }: { data: PageData } = $props();

	// svelte-ignore state_referenced_locally
	const initialGenerations = data.generations;

	let viewMode = $state<'new' | string>(
		initialGenerations.length > 0 ? initialGenerations[0].id : 'new',
	);

	let prompt = $state('');
	let selectedStyle = $state<string | null>(null);
	let selectedSize = $state('square_hd');
	let generating = $state(false);
	let currentGeneratingId = $state<string | null>(null);

	// --- Unified Image State ---
	let sourceFile = $state<File | null>(null);
	let sourcePreviewUrl = $state<string | null>(null);

	// How source image is used: 'structure' (ControlNet) or 'influence' (img2img)
	let imageMode = $state<'structure' | 'influence'>('structure');

	// Structure mode controls
	let controlMethod = $state<'canny' | 'depth'>('canny');
	let structureStrength = $state(100);

	// Influence mode controls
	let influenceStrength = $state(60);

	let generations = $state<ConceptArtGeneration[]>(initialGenerations);
	const pollingSet = new Set<string>();
	let status = $state<string | null>(null);

	// --- Derived ---
	const effectiveMode = $derived<'standard' | 'restyle'>(
		sourceFile && imageMode === 'structure' ? 'restyle' : 'standard',
	);

	const tokenCost = $derived(
		effectiveMode === 'restyle'
			? PRICING.tokenCosts.conceptArtRestyle
			: PRICING.tokenCosts.conceptArt,
	);

	const modeLabel = $derived(
		effectiveMode === 'restyle'
			? 'Restyle'
			: sourceFile
				? 'Img2Img'
				: 'Generate',
	);

	const modeDescription = $derived(
		effectiveMode === 'restyle'
			? 'New style, preserved structure'
			: sourceFile
				? 'Guided by reference image'
				: 'Create from text description',
	);

	const hasSourceImage = $derived(!!sourceFile);

	const selectedGeneration = $derived(
		viewMode !== 'new' ? generations.find((g) => g.id === viewMode) : null,
	);

	const stylePresets = [
		{ id: null, label: 'None' },
		{ id: 'painterly', label: 'Painterly' },
		{ id: 'anime', label: 'Anime' },
		{ id: 'realistic', label: 'Realistic' },
		{ id: 'pixel-art', label: 'Pixel Art' },
		{ id: 'watercolor', label: 'Watercolor' },
		{ id: 'sci-fi', label: 'Sci-Fi' },
		{ id: 'fantasy', label: 'Fantasy' },
		{ id: 'ink-drawing', label: 'Ink Drawing' },
	] as const;

	const aspectRatios = [
		{ id: 'landscape_16_9', label: '16:9', cssRatio: '16/9' },
		{ id: 'landscape_4_3', label: '4:3', cssRatio: '4/3' },
		{ id: 'square_hd', label: '1:1', cssRatio: '1/1' },
		{ id: 'portrait_4_3', label: '3:4', cssRatio: '3/4' },
		{ id: 'portrait_16_9', label: '9:16', cssRatio: '9/16' },
	] as const;

	const selectedAspectRatio = $derived(
		aspectRatios.find((a) => a.id === selectedSize) ?? aspectRatios[2],
	);

	// --- Effects ---
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

	$effect(() => {
		if (sourceFile) {
			const url = URL.createObjectURL(sourceFile);
			sourcePreviewUrl = url;
			return () => URL.revokeObjectURL(url);
		} else {
			sourcePreviewUrl = null;
		}
	});

	// --- Functions ---
	function startNewGeneration() {
		viewMode = 'new';
		prompt = '';
	}

	function selectGeneration(id: string) {
		viewMode = id;
	}

	function handleSourceDrop(event: DragEvent) {
		event.preventDefault();
		const file = event.dataTransfer?.files[0];
		if (file?.type.startsWith('image/')) sourceFile = file;
	}

	function handleSourceSelect(event: Event) {
		const input = event.target as HTMLInputElement;
		if (input.files?.[0]) sourceFile = input.files[0];
	}

	function clearSource() {
		sourceFile = null;
		sourcePreviewUrl = null;
	}

	async function generate() {
		if (!prompt.trim() || generating) return;

		if (tokenState.total < tokenCost) {
			alert('Not enough tokens');
			return;
		}

		generating = true;
		status = 'Starting generation...';

		try {
			let res: Response;

			if (effectiveMode === 'restyle') {
				const formData = new FormData();
				formData.append('mode', 'restyle');
				formData.append('prompt', prompt.trim());
				formData.append('imageSize', selectedSize);
				if (selectedStyle) formData.append('style', selectedStyle);
				formData.append(
					'compositionImageUrl',
					await uploadImageToBlob(sourceFile as File, 'concept-art'),
				);
				formData.append('controlMethod', controlMethod);
				formData.append('controlStrength', String(structureStrength));
				res = await fetch('/api/concept-art/generate', {
					method: 'POST',
					body: formData,
				});
			} else if (sourceFile) {
				const formData = new FormData();
				formData.append('prompt', prompt.trim());
				formData.append('imageSize', selectedSize);
				if (selectedStyle) formData.append('style', selectedStyle);
				formData.append(
					'imageUrl',
					await uploadImageToBlob(sourceFile, 'concept-art'),
				);
				formData.append('strength', String(influenceStrength));
				res = await fetch('/api/concept-art/generate', {
					method: 'POST',
					body: formData,
				});
			} else {
				res = await fetch('/api/concept-art/generate', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						prompt: prompt.trim(),
						imageSize: selectedSize,
						style: selectedStyle,
					}),
				});
			}

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

			track('generation_started', {
				type:
					effectiveMode === 'restyle' ? 'concept_art_restyle' : 'concept_art',
			});

			if (result.id) {
				const newGen: ConceptArtGeneration = {
					id: result.id,
					userId: data.user?.id ?? '',
					prompt: prompt.trim(),
					style: selectedStyle,
					imageSize: selectedSize,
					referenceImageUrl:
						effectiveMode === 'standard' && sourceFile
							? sourcePreviewUrl
							: null,
					referenceStrength:
						effectiveMode === 'standard' && sourceFile
							? influenceStrength
							: null,
					mode: effectiveMode,
					compositionImageUrl:
						effectiveMode !== 'standard' ? sourcePreviewUrl : null,
					styleImageUrl: null,
					controlMethod: effectiveMode !== 'standard' ? controlMethod : null,
					controlStrength:
						effectiveMode !== 'standard' ? structureStrength : null,
					controlImageUrl: null,
					styleStrength: null,
					status: 'pending',
					progress: 0,
					currentStage: null,
					falRequestId: null,
					imageUrl: null,
					seed: null,
					tokenCost: tokenCost,
					bonusTokenCost: 0,
					errorMessage: null,
					createdAt: new Date(),
					completedAt: null,
				};
				generations = [newGen, ...generations];
				currentGeneratingId = result.id;
				viewMode = result.id;
				pollingSet.add(result.id);
				await pollStatus(result.id);
			}
		} catch (e) {
			console.error('Generation error:', e);
			alert('Failed to generate concept art');
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
			const res = await fetch(`/api/concept-art/${id}/cancel`, {
				method: 'POST',
			});
			if (!res.ok) {
				const error = await res.json();
				alert(error.message || 'Failed to cancel');
				return;
			}

			const result = await res.json();

			generations = generations.map((g) =>
				g.id === id
					? {
							...g,
							status: 'failed' as const,
							errorMessage: 'Cancelled by user',
						}
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
				const res = await fetch(`/api/concept-art/${id}/status`);
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

				generations = generations.map((g) =>
					g.id === id
						? {
								...g,
								status: result.status,
								progress: result.progress || 0,
								currentStage: result.statusMessage,
								imageUrl: result.imageUrl || g.imageUrl,
								controlImageUrl: result.controlImageUrl || g.controlImageUrl,
							}
						: g,
				);

				if (result.status === 'completed') {
					pollingSet.delete(id);
					track('generation_completed', { type: 'concept_art' });

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

	function downloadImage() {
		const url = selectedGeneration?.imageUrl;
		if (!url) return;

		const name = selectedGeneration?.prompt || prompt;
		const a = document.createElement('a');
		a.href = url;
		a.download = `${name.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_concept_art.png`;
		a.click();
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

			{#if generations.length > 0}
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
				{#each generations as gen (gen.id)}
					<button
						onclick={() => selectGeneration(gen.id)}
						class="history-thumb {viewMode === gen.id
							? 'history-thumb-active'
							: ''}"
					>
						{#if gen.status === 'completed'}
							{#if gen.imageUrl}
								<img
									src={gen.imageUrl}
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

			{#if generations.length > 0}
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
		<!-- Left: Image Preview -->
		<div class="order-2 lg:order-1">
			<div class="preview-panel">
				<div class="preview-header">
					<h2 class="text-sm font-medium text-white">Preview</h2>
					{#if selectedGeneration?.status === 'completed' && selectedGeneration.imageUrl}
						<button onclick={downloadImage} class="btn-sm btn-sm-gold">
							<Download class="h-3.5 w-3.5" />
							Download
						</button>
					{/if}
				</div>
				<div
					class="preview-content"
					style="aspect-ratio: {selectedGeneration?.status === 'completed' &&
					selectedGeneration.imageUrl
						? (aspectRatios.find((a) => a.id === selectedGeneration.imageSize)
								?.cssRatio ?? '1/1')
						: viewMode === 'new'
							? selectedAspectRatio.cssRatio
							: '1/1'}"
				>
					<div class="preview-inner">
						{#if selectedGeneration?.status === 'completed' && selectedGeneration.imageUrl}
							<img
								src={selectedGeneration.imageUrl}
								alt={selectedGeneration.prompt}
								class="h-full w-full object-contain"
							/>
						{:else if selectedGeneration && (selectedGeneration.status === 'pending' || selectedGeneration.status === 'processing')}
							{#if selectedGeneration.controlImageUrl}
								<img
									src={selectedGeneration.controlImageUrl}
									alt="Control image ({selectedGeneration.controlMethod})"
									class="h-full w-full object-contain opacity-50"
								/>
								<div
									class="absolute inset-0 flex flex-col items-center justify-center"
								>
									<Loader2 class="mb-3 h-10 w-10 animate-spin text-amber-400" />
									<p class="text-sm font-medium text-zinc-200">
										{selectedGeneration.currentStage || 'Generating...'}
									</p>
									<p class="mt-1 text-xs text-zinc-400 capitalize">
										{selectedGeneration.controlMethod} structure extracted
									</p>
								</div>
							{:else}
								<Loader2 class="mb-4 h-12 w-12 animate-spin text-amber-400" />
								<p class="text-sm text-zinc-300">
									{selectedGeneration.currentStage || 'Processing...'}
								</p>
							{/if}
						{:else if selectedGeneration?.status === 'failed'}
							<X class="mb-4 h-12 w-12 text-red-400" />
							<p class="mb-2 text-center text-sm text-red-300">
								Generation failed
							</p>
							{#if selectedGeneration.errorMessage}
								<p class="text-center text-xs text-red-400/70">
									{selectedGeneration.errorMessage}
								</p>
							{/if}
						{:else}
							<Sparkles class="mb-3 h-10 w-10 text-zinc-500 opacity-30" />
							<p class="text-sm text-zinc-500">
								Your concept art will appear here
							</p>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Right: Form / Details -->
		<div class="order-1 lg:order-2">
			<div class="panel sticky top-20">
				{#if viewMode === 'new'}
					<!-- UNIFIED FORM -->

					<!-- Prompt -->
					<div class="mb-4">
						<label for="prompt" class="field-label">Description</label>
						<textarea
							id="prompt"
							bind:value={prompt}
							placeholder="Describe your concept art... environments, characters, props, scenes"
							rows="3"
							class="field-textarea"></textarea>
					</div>

					<!-- Example chips when prompt is empty -->
					{#if !prompt.trim()}
						<div class="mb-4" transition:slide={{ duration: 150 }}>
							<p class="mb-2 text-xs text-zinc-500">Try these:</p>
							<div class="flex flex-wrap gap-1.5">
								{#each ['medieval castle on a cliff at sunset', 'cyberpunk street market at night', 'underwater coral kingdom', 'cozy witch cottage in autumn forest', 'space station interior, control room'] as example (example)}
									<button
										onclick={() => (prompt = example)}
										class="example-chip"
									>
										{example}
									</button>
								{/each}
							</div>
						</div>
					{/if}

					<!-- Image Inputs -->
					<div class="images-section">
						<div class="images-header">
							<span class="field-label" style="margin-bottom: 0">Images</span>
							<span class="text-[10px] text-zinc-600">optional</span>
						</div>

						<!-- Source Image -->
						<div>
							<p class="img-zone-label">
								<Layers class="h-3 w-3" />
								Source
							</p>
							{#if sourcePreviewUrl}
								<div class="img-zone img-zone-filled">
									<img
										src={sourcePreviewUrl}
										alt="Source"
										class="img-zone-img"
									/>
									<button onclick={clearSource} class="img-zone-clear">
										<X class="h-3 w-3" />
									</button>
								</div>
							{:else}
								<div
									ondrop={handleSourceDrop}
									ondragover={(e) => e.preventDefault()}
									role="button"
									tabindex="0"
									aria-label="Drop zone for source image"
									class="img-zone"
								>
									<input
										type="file"
										accept="image/png,image/jpeg,image/webp"
										onchange={handleSourceSelect}
										class="absolute inset-0 h-full w-full cursor-pointer opacity-0"
									/>
									<ImagePlus class="mb-1 h-5 w-5 text-zinc-500" />
									<p class="text-[10px] text-zinc-500">
										Drop or click to add image
									</p>
								</div>
							{/if}
						</div>

						<!-- Contextual Image Controls -->
						{#if hasSourceImage}
							<div class="img-controls" transition:slide={{ duration: 200 }}>
								<!-- Image Mode Toggle -->
								<div class="mb-3">
									<p
										class="mb-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
									>
										Image mode
									</p>
									<div class="toggle-group">
										<button
											onclick={() => (imageMode = 'structure')}
											class="toggle-btn {imageMode === 'structure'
												? 'toggle-btn-active'
												: ''}"
										>
											<Layers class="h-3.5 w-3.5" />
											Structure
										</button>
										<button
											onclick={() => (imageMode = 'influence')}
											class="toggle-btn {imageMode === 'influence'
												? 'toggle-btn-active'
												: ''}"
										>
											<Zap class="h-3.5 w-3.5" />
											Influence
										</button>
									</div>
									<p class="mt-1 text-[10px] text-zinc-600">
										{imageMode === 'structure'
											? 'Preserves composition layout via ControlNet'
											: 'Loosely guides the generation (img2img)'}
									</p>
								</div>

								{#if imageMode === 'structure'}
									<!-- Control Method -->
									<div class="mb-3" transition:slide={{ duration: 150 }}>
										<p
											class="mb-1.5 text-[10px] font-medium tracking-wider text-zinc-500 uppercase"
										>
											Control method
										</p>
										<div class="flex gap-1.5">
											<button
												onclick={() => (controlMethod = 'canny')}
												class="pill {controlMethod === 'canny'
													? 'pill-active'
													: ''}"
											>
												Canny (edges)
											</button>
											<button
												onclick={() => (controlMethod = 'depth')}
												class="pill {controlMethod === 'depth'
													? 'pill-active'
													: ''}"
											>
												Depth (3D)
											</button>
										</div>
									</div>

									<!-- Structure Strength -->
									<div class="mb-1">
										<div class="mb-1 flex items-center justify-between">
											<label
												for="structure-str"
												class="text-[11px] text-zinc-400"
												>Structure strength</label
											>
											<span class="font-mono text-[11px] text-zinc-500"
												>{structureStrength}%</span
											>
										</div>
										<input
											id="structure-str"
											type="range"
											min="0"
											max="100"
											bind:value={structureStrength}
											class="ctrl-slider"
										/>
									</div>
								{:else}
									<!-- Influence Strength -->
									<div class="mb-1" transition:slide={{ duration: 150 }}>
										<div class="mb-1 flex items-center justify-between">
											<label
												for="influence-str"
												class="text-[11px] text-zinc-400"
												>Reference strength</label
											>
											<span class="font-mono text-[11px] text-zinc-500"
												>{influenceStrength}%</span
											>
										</div>
										<input
											id="influence-str"
											type="range"
											min="0"
											max="100"
											bind:value={influenceStrength}
											class="ctrl-slider"
										/>
										<p class="mt-1 text-[10px] text-zinc-600">
											Lower = more creative freedom &middot; Higher = closer to
											source
										</p>
									</div>
								{/if}
							</div>
						{/if}
					</div>

					<!-- Style Presets -->
					<div class="mb-4">
						<label class="field-label">Style</label>
						<div class="flex flex-wrap gap-1.5">
							{#each stylePresets as preset (preset.label)}
								<button
									onclick={() => (selectedStyle = preset.id)}
									class="pill {selectedStyle === preset.id
										? 'pill-active'
										: ''}"
								>
									{preset.label}
								</button>
							{/each}
						</div>
					</div>

					<!-- Aspect Ratio -->
					<div class="mb-5">
						<label class="field-label">Aspect Ratio</label>
						<div class="flex gap-2">
							{#each aspectRatios as ratio (ratio.id)}
								<button
									onclick={() => (selectedSize = ratio.id)}
									class="ratio-btn {selectedSize === ratio.id
										? 'ratio-btn-active'
										: ''}"
								>
									<div
										class="ratio-icon"
										style="aspect-ratio: {ratio.cssRatio}"
									></div>
									<span class="text-[10px]">{ratio.label}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Mode Indicator -->
					<div class="mode-indicator">
						<div class="flex items-center gap-2">
							<span
								class="mode-badge mode-badge-{effectiveMode === 'restyle'
									? 'restyle'
									: 'generate'}"
							>
								{modeLabel}
							</span>
							<span class="text-[11px] text-zinc-500">{modeDescription}</span>
						</div>
						<span class="text-[11px] font-medium text-zinc-400"
							>{tokenCost} tokens</span
						>
					</div>

					<!-- Status -->
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

					<!-- Generate Button -->
					<button
						onclick={generate}
						disabled={!prompt.trim() ||
							generating ||
							tokenState.total < tokenCost}
						class="btn-generate"
					>
						{#if generating}
							<Loader2 class="h-4 w-4 animate-spin" />
							Generating...
						{:else}
							<Sparkles class="h-4 w-4" />
							Generate ({tokenCost} tokens)
						{/if}
					</button>
				{:else if selectedGeneration}
					<!-- DETAIL VIEW -->
					<div class="mb-4 flex items-center justify-between">
						<h2 class="panel-title" style="margin-bottom:0">
							{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
								Generating...
							{:else if selectedGeneration.status === 'completed'}
								Concept Art Complete
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

					{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
						<button
							onclick={() => cancelGeneration(selectedGeneration.id)}
							class="btn-cancel"
						>
							<X class="h-4 w-4" />
							Cancel Generation
						</button>
					{:else if selectedGeneration.status === 'failed'}
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

						{#if selectedGeneration.mode === 'restyle' && selectedGeneration.compositionImageUrl}
							<div class="mb-4">
								<span class="mb-2 block text-xs text-zinc-500">References</span>
								<div class="grid grid-cols-2 gap-2">
									<div
										class="rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-2"
									>
										<img
											src={selectedGeneration.compositionImageUrl}
											alt="Source"
											class="mb-1.5 aspect-square w-full rounded-lg object-cover"
										/>
										<p class="text-[10px] text-zinc-500">Source</p>
									</div>
									{#if selectedGeneration.controlImageUrl}
										<div
											class="rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-2"
										>
											<img
												src={selectedGeneration.controlImageUrl}
												alt="Control"
												class="mb-1.5 aspect-square w-full rounded-lg object-cover"
											/>
											<p class="text-[10px] text-zinc-500 capitalize">
												{selectedGeneration.controlMethod} map
											</p>
										</div>
									{/if}
								</div>
							</div>
						{:else if selectedGeneration.referenceImageUrl}
							<div class="mb-4">
								<span class="mb-2 block text-xs text-zinc-500">Reference</span>
								<div
									class="flex items-center gap-3 rounded-xl border border-zinc-700/40 bg-zinc-800/30 p-2"
								>
									<img
										src={selectedGeneration.referenceImageUrl}
										alt="Reference"
										class="h-12 w-12 rounded-lg object-cover"
									/>
									<div class="text-sm">
										<span class="text-zinc-300">Strength:</span>
										<span class="ml-1 font-medium text-white"
											>{selectedGeneration.referenceStrength ?? 60}%</span
										>
									</div>
								</div>
							</div>
						{/if}

						<div
							class="mb-4 rounded-xl border border-zinc-700/40 bg-zinc-800/25 p-3"
						>
							<div class="flex items-center justify-between text-sm">
								<span class="text-zinc-400">Token Cost</span>
								<span class="font-medium text-white"
									>{selectedGeneration.tokenCost}</span
								>
							</div>
							{#if selectedGeneration.mode !== 'standard'}
								<div class="mt-2 flex items-center justify-between text-sm">
									<span class="text-zinc-400">Mode</span>
									<span class="font-medium text-white capitalize"
										>{selectedGeneration.mode}</span
									>
								</div>
							{/if}
							{#if selectedGeneration.controlMethod}
								<div class="mt-2 flex items-center justify-between text-sm">
									<span class="text-zinc-400">Control</span>
									<span class="font-medium text-white capitalize"
										>{selectedGeneration.controlMethod}</span
									>
								</div>
							{/if}
							{#if selectedGeneration.style}
								<div class="mt-2 flex items-center justify-between text-sm">
									<span class="text-zinc-400">Style</span>
									<span class="font-medium text-white capitalize"
										>{selectedGeneration.style.replace('-', ' ')}</span
									>
								</div>
							{/if}
							{#if selectedGeneration.seed}
								<div class="mt-2 flex items-center justify-between text-sm">
									<span class="text-zinc-400">Seed</span>
									<span class="font-medium text-white"
										>{selectedGeneration.seed}</span
									>
								</div>
							{/if}
						</div>

						<div class="flex gap-2">
							<button onclick={downloadImage} class="btn-download flex-1">
								<Download class="h-4 w-4" />
								Download
							</button>
							<button onclick={startNewGeneration} class="btn-secondary px-4">
								<Plus class="h-4 w-4" />
							</button>
						</div>
					{/if}
				{/if}
			</div>
		</div>
	</div>
</div>

<style>
	/* ═══ Panels ═══ */
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

	/* ═══ History Bar ═══ */
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

	/* ═══ Preview Panel ═══ */
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
	.preview-content {
		background: rgba(9, 9, 11, 0.4);
		max-height: 70vh;
		min-height: 20rem;
		margin: 0 auto;
		position: relative;
	}
	.preview-inner {
		position: absolute;
		inset: 0;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
	}

	/* ═══ Form Fields ═══ */
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

	/* ═══ Image Upload Zones ═══ */
	.images-section {
		margin-bottom: 1rem;
		padding: 0.75rem;
		background: rgba(39, 39, 42, 0.15);
		border: 1px solid rgba(63, 63, 70, 0.25);
		border-radius: 0.75rem;
	}
	.images-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 0.5rem;
	}
	.img-zone-label {
		display: flex;
		align-items: center;
		gap: 0.3rem;
		font-size: 0.6875rem;
		font-weight: 500;
		color: #71717a;
		margin-bottom: 0.35rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
	}
	.img-zone {
		position: relative;
		aspect-ratio: 1/1;
		background: rgba(24, 24, 27, 0.4);
		border: 2px dashed rgba(63, 63, 70, 0.45);
		border-radius: 0.6rem;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		cursor: pointer;
		transition:
			border-color 0.25s,
			background 0.25s,
			box-shadow 0.25s;
		overflow: hidden;
	}
	.img-zone:hover:not(.img-zone-locked) {
		border-color: rgba(245, 158, 11, 0.35);
		background: rgba(24, 24, 27, 0.6);
		box-shadow: 0 0 12px rgba(245, 158, 11, 0.06);
	}
	.img-zone-filled {
		border-style: solid;
		border-color: rgba(63, 63, 70, 0.4);
		cursor: default;
	}
	.img-zone-filled:hover {
		border-color: rgba(63, 63, 70, 0.5) !important;
		box-shadow: none !important;
	}
	.img-zone-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}
	.img-zone-clear {
		position: absolute;
		top: 0.35rem;
		right: 0.35rem;
		width: 1.35rem;
		height: 1.35rem;
		border-radius: 50%;
		background: rgba(0, 0, 0, 0.7);
		border: 1px solid rgba(255, 255, 255, 0.15);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		cursor: pointer;
		opacity: 0;
		transition:
			opacity 0.2s,
			background 0.2s;
	}
	.img-zone-filled:hover .img-zone-clear {
		opacity: 1;
	}
	.img-zone-clear:hover {
		background: rgba(239, 68, 68, 0.8);
	}

	/* ═══ Image Controls ═══ */
	.img-controls {
		margin-top: 0.75rem;
		padding-top: 0.75rem;
		border-top: 1px solid rgba(63, 63, 70, 0.2);
	}
	.toggle-group {
		display: flex;
		gap: 0.25rem;
		padding: 0.2rem;
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.3);
		border-radius: 0.5rem;
	}
	.toggle-btn {
		flex: 1;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.35rem;
		padding: 0.4rem 0.5rem;
		font-size: 0.75rem;
		font-weight: 500;
		color: #71717a;
		background: none;
		border: none;
		border-radius: 0.35rem;
		cursor: pointer;
		transition: all 0.2s;
	}
	.toggle-btn:hover {
		color: #a1a1aa;
		background: rgba(63, 63, 70, 0.2);
	}
	.toggle-btn-active {
		color: #fbbf24;
		background: rgba(245, 158, 11, 0.1);
		box-shadow: 0 0 0 1px rgba(245, 158, 11, 0.2);
	}

	/* ═══ Sliders ═══ */
	.ctrl-slider {
		width: 100%;
		height: 0.3rem;
		appearance: none;
		background: rgba(63, 63, 70, 0.4);
		border-radius: 0.15rem;
		outline: none;
	}
	.ctrl-slider::-webkit-slider-thumb {
		appearance: none;
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		background: #fbbf24;
		cursor: pointer;
		border: 2px solid #18181b;
	}
	.ctrl-slider::-moz-range-thumb {
		width: 0.8rem;
		height: 0.8rem;
		border-radius: 50%;
		background: #fbbf24;
		cursor: pointer;
		border: 2px solid #18181b;
	}

	/* ═══ Style Pills ═══ */
	.pill {
		padding: 0.3rem 0.65rem;
		font-size: 0.75rem;
		background: rgba(39, 39, 42, 0.4);
		border: 1px solid rgba(63, 63, 70, 0.4);
		border-radius: 2rem;
		color: #a1a1aa;
		cursor: pointer;
		transition: all 0.2s;
	}
	.pill:hover {
		background: rgba(63, 63, 70, 0.5);
		color: #fff;
	}
	.pill-active {
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.4);
		color: #fbbf24;
	}

	/* ═══ Aspect Ratio ═══ */
	.ratio-btn {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 0.3rem;
		padding: 0.45rem 0.6rem;
		background: rgba(39, 39, 42, 0.4);
		border: 1px solid rgba(63, 63, 70, 0.4);
		border-radius: 0.55rem;
		color: #a1a1aa;
		cursor: pointer;
		transition: all 0.2s;
		flex: 1;
	}
	.ratio-btn:hover {
		background: rgba(63, 63, 70, 0.5);
		color: #fff;
	}
	.ratio-btn-active {
		background: rgba(245, 158, 11, 0.1);
		border-color: rgba(245, 158, 11, 0.4);
		color: #fbbf24;
	}
	.ratio-icon {
		height: 1.6rem;
		border: 1.5px solid currentColor;
		border-radius: 0.2rem;
	}

	/* ═══ Mode Indicator ═══ */
	.mode-indicator {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.5rem 0.65rem;
		margin-bottom: 1rem;
		background: rgba(39, 39, 42, 0.2);
		border: 1px solid rgba(63, 63, 70, 0.2);
		border-radius: 0.55rem;
	}
	.mode-badge {
		font-size: 0.65rem;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		padding: 0.15rem 0.45rem;
		border-radius: 2rem;
		line-height: 1.2;
	}
	.mode-badge-generate {
		background: rgba(161, 161, 170, 0.12);
		color: #a1a1aa;
	}
	.mode-badge-restyle {
		background: rgba(245, 158, 11, 0.12);
		color: #fbbf24;
	}

	/* ═══ Example Chips ═══ */
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

	/* ═══ Buttons ═══ */
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
