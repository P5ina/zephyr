<script lang="ts">
import {
	Check,
	ChevronDown,
	ChevronLeft,
	ChevronRight,
	Download,
	ImagePlus,
	Layers,
	Loader2,
	Paintbrush,
	Plus,
	Sparkles,
	X,
} from 'lucide-svelte';
import { track } from '@vercel/analytics';
import { PRICING } from '$lib/pricing';
import type { ConceptArtGeneration } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialGenerations = data.generations;

// svelte-ignore state_referenced_locally
let tokens = $state(data.user?.tokens ?? 0);
// svelte-ignore state_referenced_locally
let bonusTokens = $state(data.user?.bonusTokens ?? 0);

let viewMode = $state<'new' | string>(
	initialGenerations.length > 0 ? initialGenerations[0].id : 'new',
);

let prompt = $state('');
let selectedStyle = $state<string | null>(null);
let selectedSize = $state('square_hd');
let generating = $state(false);
let currentGeneratingId = $state<string | null>(null);

// Reference image state
let referenceFile = $state<File | null>(null);
let referencePreviewUrl = $state<string | null>(null);
let referenceStrength = $state(60);
let showReferenceSection = $state(false);

// Mode toggle: 'generate' | 'remix'
let activeMode = $state<'generate' | 'remix'>('generate');

// Remix state
let compositionFile = $state<File | null>(null);
let compositionPreviewUrl = $state<string | null>(null);
let styleFile = $state<File | null>(null);
let stylePreviewUrl = $state<string | null>(null);
let controlMethod = $state<'canny' | 'depth'>('canny');
let compositionStrength = $state(70);
let styleStrengthSlider = $state(80);

const REMIX_TOKEN_COST = PRICING.tokenCosts.conceptArtRemix;

let generations = $state<ConceptArtGeneration[]>(initialGenerations);

const pollingSet = new Set<string>();

let status = $state<string | null>(null);

const TOKEN_COST = PRICING.tokenCosts.conceptArt;

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

// Clean up preview URL when file changes
$effect(() => {
	if (referenceFile) {
		const url = URL.createObjectURL(referenceFile);
		referencePreviewUrl = url;
		return () => URL.revokeObjectURL(url);
	} else {
		referencePreviewUrl = null;
	}
});

$effect(() => {
	if (compositionFile) {
		const url = URL.createObjectURL(compositionFile);
		compositionPreviewUrl = url;
		return () => URL.revokeObjectURL(url);
	} else {
		compositionPreviewUrl = null;
	}
});

$effect(() => {
	if (styleFile) {
		const url = URL.createObjectURL(styleFile);
		stylePreviewUrl = url;
		return () => URL.revokeObjectURL(url);
	} else {
		stylePreviewUrl = null;
	}
});

function startNewGeneration() {
	viewMode = 'new';
	prompt = '';
}

function selectGeneration(id: string) {
	viewMode = id;
}

function handleRefFileDrop(event: DragEvent) {
	event.preventDefault();
	const file = event.dataTransfer?.files[0];
	if (file?.type.startsWith('image/')) {
		referenceFile = file;
		showReferenceSection = true;
	}
}

function handleRefFileSelect(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) {
		referenceFile = file;
	}
}

function clearReference() {
	referenceFile = null;
	referencePreviewUrl = null;
}

function handleCompositionDrop(event: DragEvent) {
	event.preventDefault();
	const file = event.dataTransfer?.files[0];
	if (file?.type.startsWith('image/')) compositionFile = file;
}

function handleCompositionSelect(event: Event) {
	const input = event.target as HTMLInputElement;
	if (input.files?.[0]) compositionFile = input.files[0];
}

function clearComposition() {
	compositionFile = null;
	compositionPreviewUrl = null;
}

function handleStyleDrop(event: DragEvent) {
	event.preventDefault();
	const file = event.dataTransfer?.files[0];
	if (file?.type.startsWith('image/')) styleFile = file;
}

function handleStyleSelect(event: Event) {
	const input = event.target as HTMLInputElement;
	if (input.files?.[0]) styleFile = input.files[0];
}

function clearStyle() {
	styleFile = null;
	stylePreviewUrl = null;
}

async function generate() {
	if (!prompt.trim() || generating) return;

	const isRemix = activeMode === 'remix';
	const cost = isRemix ? REMIX_TOKEN_COST : TOKEN_COST;

	if (tokens + bonusTokens < cost) {
		alert('Not enough tokens');
		return;
	}

	if (isRemix && (!compositionFile || !styleFile)) {
		alert('Both composition and style images are required for remix mode');
		return;
	}

	generating = true;
	status = 'Starting generation...';

	try {
		let res: Response;

		if (isRemix) {
			const formData = new FormData();
			formData.append('mode', 'remix');
			formData.append('prompt', prompt.trim());
			formData.append('imageSize', selectedSize);
			if (selectedStyle) formData.append('style', selectedStyle);
			formData.append('compositionImage', compositionFile!);
			formData.append('styleImage', styleFile!);
			formData.append('controlMethod', controlMethod);
			formData.append('controlStrength', String(compositionStrength));
			formData.append('styleStrength', String(styleStrengthSlider));

			res = await fetch('/api/concept-art/generate', {
				method: 'POST',
				body: formData,
			});
		} else if (referenceFile) {
			const formData = new FormData();
			formData.append('prompt', prompt.trim());
			formData.append('imageSize', selectedSize);
			if (selectedStyle) formData.append('style', selectedStyle);
			formData.append('image', referenceFile);
			formData.append('strength', String(referenceStrength));

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
		tokens = result.tokensRemaining ?? tokens;
		bonusTokens = result.bonusTokensRemaining ?? bonusTokens;

		track('generation_started', { type: isRemix ? 'concept_art_remix' : 'concept_art' });

		if (result.id) {
			const newGen: ConceptArtGeneration = {
				id: result.id,
				userId: data.user?.id ?? '',
				prompt: prompt.trim(),
				style: selectedStyle,
				imageSize: selectedSize,
				referenceImageUrl: isRemix ? null : referencePreviewUrl,
				referenceStrength: !isRemix && referenceFile ? referenceStrength : null,
				mode: isRemix ? 'remix' : 'standard',
				compositionImageUrl: isRemix ? compositionPreviewUrl : null,
				styleImageUrl: isRemix ? stylePreviewUrl : null,
				controlMethod: isRemix ? controlMethod : null,
				controlStrength: isRemix ? compositionStrength : null,
				styleStrength: isRemix ? styleStrengthSlider : null,
				status: 'pending',
				progress: 0,
				currentStage: null,
				falRequestId: null,
				imageUrl: null,
				seed: null,
				tokenCost: cost,
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
	if (!confirm('Cancel this generation? Your tokens will be refunded.')) return;

	try {
		const res = await fetch(`/api/concept-art/${id}/cancel`, { method: 'POST' });
		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to cancel');
			return;
		}

		const result = await res.json();

		generations = generations.map((g) =>
			g.id === id
				? { ...g, status: 'failed' as const, errorMessage: 'Cancelled by user' }
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

			{#if generations.length > 0}
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
				{#each generations as gen (gen.id)}
					<button
						onclick={() => selectGeneration(gen.id)}
						class="history-thumb {viewMode === gen.id ? 'history-thumb-active' : ''}"
					>
						{#if gen.status === 'completed'}
							{#if gen.imageUrl}
								<img
									src={gen.imageUrl}
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

			{#if generations.length > 0}
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
		<!-- Left: Image Preview -->
		<div class="order-2 lg:order-1">
			<div class="preview-panel">
				<div class="preview-header">
					<h2 class="text-sm font-medium text-white">Preview</h2>
					{#if selectedGeneration?.status === 'completed' && selectedGeneration.imageUrl}
						<button onclick={downloadImage} class="btn-sm btn-sm-gold">
							<Download class="w-3.5 h-3.5" />
							Download
						</button>
					{/if}
				</div>
				<div class="preview-content" style="aspect-ratio: {selectedGeneration?.status === 'completed' && selectedGeneration.imageUrl ? (aspectRatios.find(a => a.id === selectedGeneration.imageSize)?.cssRatio ?? '1/1') : (viewMode === 'new' ? selectedAspectRatio.cssRatio : '1/1')}">
					<div class="preview-inner">
						{#if selectedGeneration?.status === 'completed' && selectedGeneration.imageUrl}
							<img
								src={selectedGeneration.imageUrl}
								alt={selectedGeneration.prompt}
								class="w-full h-full object-contain"
							/>
						{:else if selectedGeneration && (selectedGeneration.status === 'pending' || selectedGeneration.status === 'processing')}
							<Loader2 class="w-12 h-12 animate-spin text-amber-400 mb-4" />
							<p class="text-sm text-zinc-300">{selectedGeneration.currentStage || 'Processing...'}</p>
						{:else if selectedGeneration?.status === 'failed'}
							<X class="w-12 h-12 text-red-400 mb-4" />
							<p class="text-sm text-red-300 text-center mb-2">Generation failed</p>
							{#if selectedGeneration.errorMessage}
								<p class="text-xs text-red-400/70 text-center">{selectedGeneration.errorMessage}</p>
							{/if}
						{:else}
							<Sparkles class="w-10 h-10 mb-3 opacity-30 text-zinc-500" />
							<p class="text-sm text-zinc-500">Your concept art will appear here</p>
						{/if}
					</div>
				</div>
			</div>
		</div>

		<!-- Right: Form / Details -->
		<div class="order-1 lg:order-2">
			<div class="panel sticky top-20">
				{#if viewMode === 'new'}
					<!-- Mode Toggle Tabs -->
					<div class="mode-tabs mb-5">
						<button
							onclick={() => (activeMode = 'generate')}
							class="mode-tab {activeMode === 'generate' ? 'mode-tab-active' : ''}"
						>
							<Sparkles class="w-3.5 h-3.5" />
							Generate
						</button>
						<button
							onclick={() => (activeMode = 'remix')}
							class="mode-tab {activeMode === 'remix' ? 'mode-tab-active' : ''}"
						>
							<Layers class="w-3.5 h-3.5" />
							Remix
							<span class="beta-badge">Beta</span>
						</button>
					</div>

					{#if activeMode === 'generate'}
					<h2 class="panel-title">Generate Concept Art</h2>
					<p class="text-sm text-zinc-400 mb-5">
						Create concept art for environments, characters, props, and more.
						Choose a style preset and aspect ratio to match your vision.
					</p>

					<div class="mb-4">
						<label for="prompt" class="field-label">Description</label>
						<textarea
							id="prompt"
							bind:value={prompt}
							placeholder="e.g., a mystical forest temple overgrown with vines, golden hour lighting..."
							rows="4"
							class="field-textarea"
						></textarea>
					</div>

					<!-- Style Presets -->
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

					<!-- Reference Image (collapsible) -->
					<div class="mb-4">
						<button
							onclick={() => (showReferenceSection = !showReferenceSection)}
							class="ref-toggle"
						>
							<div class="flex items-center gap-2">
								<ImagePlus class="w-4 h-4 text-zinc-400" />
								<span class="text-[.8125rem] font-medium text-zinc-300">Reference Image</span>
								{#if referenceFile}
									<span class="ref-badge">1 image</span>
								{/if}
							</div>
							<ChevronDown class="w-4 h-4 text-zinc-500 transition-transform {showReferenceSection ? 'rotate-180' : ''}" />
						</button>

						{#if showReferenceSection}
							<div class="ref-content">
								{#if referencePreviewUrl}
									<!-- Thumbnail preview with clear button -->
									<div class="ref-preview">
										<img
											src={referencePreviewUrl}
											alt="Reference"
											class="ref-preview-img"
										/>
										<button onclick={clearReference} class="ref-clear">
											<X class="w-3.5 h-3.5" />
										</button>
									</div>
								{:else}
									<!-- Drop zone -->
									<!-- svelte-ignore a11y_no_static_element_interactions -->
									<div
										ondrop={handleRefFileDrop}
										ondragover={(e) => e.preventDefault()}
										ondragleave={(e) => e.preventDefault()}
										role="button"
										tabindex="0"
										aria-label="Drop zone for reference image upload"
										class="ref-dropzone"
									>
										<input
											type="file"
											accept="image/png,image/jpeg,image/webp"
											onchange={handleRefFileSelect}
											class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
										/>
										<ImagePlus class="w-6 h-6 text-zinc-500 mb-2" />
										<p class="text-xs text-zinc-500">Drop image or click to upload</p>
										<p class="text-[10px] text-zinc-600 mt-1">PNG, JPEG, WebP &middot; Max 10MB</p>
									</div>
								{/if}

								<!-- Strength slider -->
								<div class="mt-3">
									<div class="flex items-center justify-between mb-1.5">
										<label for="strength" class="text-xs text-zinc-400">Strength</label>
										<span class="text-xs text-zinc-500 font-mono">{referenceStrength}%</span>
									</div>
									<input
										id="strength"
										type="range"
										min="0"
										max="100"
										bind:value={referenceStrength}
										class="ref-slider"
									/>
									<p class="text-[10px] text-zinc-600 mt-1">
										Lower = style influence &middot; Higher = composition influence
									</p>
								</div>
							</div>
						{/if}
					</div>

					<!-- Aspect Ratio -->
					<div class="mb-4">
						<label class="field-label">Aspect Ratio</label>
						<div class="flex gap-2">
							{#each aspectRatios as ratio}
								<button
									onclick={() => (selectedSize = ratio.id)}
									class="ratio-btn {selectedSize === ratio.id ? 'ratio-btn-active' : ''}"
								>
									<div class="ratio-icon" style="aspect-ratio: {ratio.cssRatio}"></div>
									<span class="text-[10px]">{ratio.label}</span>
								</button>
							{/each}
						</div>
					</div>

					<!-- Example Chips -->
					<div class="mb-5">
						<p class="text-xs text-zinc-500 mb-2">Try these:</p>
						<div class="flex flex-wrap gap-2">
							{#each [
								'medieval castle on a cliff at sunset',
								'cyberpunk street market at night',
								'underwater coral kingdom',
								'cozy witch cottage in autumn forest',
								'space station interior, control room',
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
							Generate Concept Art ({TOKEN_COST} tokens)
						{/if}
					</button>

					<p class="mt-4 text-xs text-zinc-500 text-center">
						Generates a full-scene concept art image. Output varies by aspect ratio.
					</p>
					{:else}
					<!-- REMIX MODE -->
					<p class="text-sm text-zinc-400 mb-5">
						Combine the structure of one image with the visual style of another.
						Upload a composition reference and a style reference, then describe what you want.
					</p>

					<div class="mb-4">
						<label for="remix-prompt" class="field-label">Description</label>
						<textarea
							id="remix-prompt"
							bind:value={prompt}
							placeholder="e.g., a warrior standing at the gates of a dark fortress..."
							rows="4"
							class="field-textarea"
						></textarea>
					</div>

					<!-- Style Presets -->
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

					<!-- Dual Image Upload -->
					<div class="mb-4 grid grid-cols-2 gap-3">
						<!-- Composition Image -->
						<div>
							<label class="field-label flex items-center gap-1.5">
								<Layers class="w-3.5 h-3.5 text-zinc-500" />
								Composition
							</label>
							{#if compositionPreviewUrl}
								<div class="ref-preview">
									<img src={compositionPreviewUrl} alt="Composition" class="remix-preview-img" />
									<button onclick={clearComposition} class="ref-clear">
										<X class="w-3.5 h-3.5" />
									</button>
								</div>
							{:else}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									ondrop={handleCompositionDrop}
									ondragover={(e) => e.preventDefault()}
									role="button"
									tabindex="0"
									aria-label="Drop zone for composition image"
									class="remix-dropzone"
								>
									<input
										type="file"
										accept="image/png,image/jpeg,image/webp"
										onchange={handleCompositionSelect}
										class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
									/>
									<Layers class="w-5 h-5 text-zinc-500 mb-1" />
									<p class="text-[10px] text-zinc-500">Structure</p>
								</div>
							{/if}
						</div>

						<!-- Style Image -->
						<div>
							<label class="field-label flex items-center gap-1.5">
								<Paintbrush class="w-3.5 h-3.5 text-zinc-500" />
								Style
							</label>
							{#if stylePreviewUrl}
								<div class="ref-preview">
									<img src={stylePreviewUrl} alt="Style" class="remix-preview-img" />
									<button onclick={clearStyle} class="ref-clear">
										<X class="w-3.5 h-3.5" />
									</button>
								</div>
							{:else}
								<!-- svelte-ignore a11y_no_static_element_interactions -->
								<div
									ondrop={handleStyleDrop}
									ondragover={(e) => e.preventDefault()}
									role="button"
									tabindex="0"
									aria-label="Drop zone for style image"
									class="remix-dropzone"
								>
									<input
										type="file"
										accept="image/png,image/jpeg,image/webp"
										onchange={handleStyleSelect}
										class="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
									/>
									<Paintbrush class="w-5 h-5 text-zinc-500 mb-1" />
									<p class="text-[10px] text-zinc-500">Visual style</p>
								</div>
							{/if}
						</div>
					</div>

					<!-- Control Method -->
					<div class="mb-4">
						<label class="field-label">Control Method</label>
						<div class="flex gap-2">
							<button
								onclick={() => (controlMethod = 'canny')}
								class="pill {controlMethod === 'canny' ? 'pill-active' : ''}"
							>
								Canny (edges)
							</button>
							<button
								onclick={() => (controlMethod = 'depth')}
								class="pill {controlMethod === 'depth' ? 'pill-active' : ''}"
							>
								Depth (3D structure)
							</button>
						</div>
					</div>

					<!-- Strength Sliders -->
					<div class="mb-4 grid grid-cols-2 gap-3">
						<div>
							<div class="flex items-center justify-between mb-1.5">
								<label for="comp-strength" class="text-xs text-zinc-400">Composition</label>
								<span class="text-xs text-zinc-500 font-mono">{compositionStrength}%</span>
							</div>
							<input
								id="comp-strength"
								type="range"
								min="0"
								max="100"
								bind:value={compositionStrength}
								class="ref-slider"
							/>
							<p class="text-[10px] text-zinc-600 mt-1">Structure adherence</p>
						</div>
						<div>
							<div class="flex items-center justify-between mb-1.5">
								<label for="style-strength" class="text-xs text-zinc-400">Style</label>
								<span class="text-xs text-zinc-500 font-mono">{styleStrengthSlider}%</span>
							</div>
							<input
								id="style-strength"
								type="range"
								min="0"
								max="100"
								bind:value={styleStrengthSlider}
								class="ref-slider"
							/>
							<p class="text-[10px] text-zinc-600 mt-1">Style transfer</p>
						</div>
					</div>

					<!-- Aspect Ratio -->
					<div class="mb-4">
						<label class="field-label">Aspect Ratio</label>
						<div class="flex gap-2">
							{#each aspectRatios as ratio}
								<button
									onclick={() => (selectedSize = ratio.id)}
									class="ratio-btn {selectedSize === ratio.id ? 'ratio-btn-active' : ''}"
								>
									<div class="ratio-icon" style="aspect-ratio: {ratio.cssRatio}"></div>
									<span class="text-[10px]">{ratio.label}</span>
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
						disabled={!prompt.trim() || generating || !compositionFile || !styleFile || tokens + bonusTokens < REMIX_TOKEN_COST}
						class="btn-generate"
					>
						{#if generating}
							<Loader2 class="w-4 h-4 animate-spin" />
							Generating...
						{:else}
							<Layers class="w-4 h-4" />
							Remix ({REMIX_TOKEN_COST} tokens)
						{/if}
					</button>

					<p class="mt-4 text-xs text-zinc-500 text-center">
						Combines structure from composition image with the visual style of another.
					</p>
					{/if}
				{:else if selectedGeneration}
					<div class="flex items-center justify-between mb-4">
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
						<span class="text-xs text-zinc-500">{formatDate(selectedGeneration.createdAt)}</span>
					</div>

					{#if selectedGeneration.status === 'processing' || selectedGeneration.status === 'pending'}
						<button
							onclick={() => cancelGeneration(selectedGeneration.id)}
							class="btn-cancel"
						>
							<X class="w-4 h-4" />
							Cancel Generation
						</button>
					{:else if selectedGeneration.status === 'failed'}
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

						{#if selectedGeneration.mode === 'remix' && (selectedGeneration.compositionImageUrl || selectedGeneration.styleImageUrl)}
							<div class="mb-4">
								<span class="text-xs text-zinc-500 mb-2 block">Remix References</span>
								<div class="grid grid-cols-2 gap-2">
									{#if selectedGeneration.compositionImageUrl}
										<div class="p-2 bg-zinc-800/30 rounded-xl border border-zinc-700/40">
											<img
												src={selectedGeneration.compositionImageUrl}
												alt="Composition"
												class="w-full aspect-square rounded-lg object-cover mb-1.5"
											/>
											<p class="text-[10px] text-zinc-500">Composition</p>
											<p class="text-xs text-white font-medium">{selectedGeneration.controlStrength ?? 70}%</p>
										</div>
									{/if}
									{#if selectedGeneration.styleImageUrl}
										<div class="p-2 bg-zinc-800/30 rounded-xl border border-zinc-700/40">
											<img
												src={selectedGeneration.styleImageUrl}
												alt="Style"
												class="w-full aspect-square rounded-lg object-cover mb-1.5"
											/>
											<p class="text-[10px] text-zinc-500">Style</p>
											<p class="text-xs text-white font-medium">{selectedGeneration.styleStrength ?? 80}%</p>
										</div>
									{/if}
								</div>
							</div>
						{:else if selectedGeneration.referenceImageUrl}
							<div class="mb-4">
								<span class="text-xs text-zinc-500 mb-2 block">Reference Image</span>
								<div class="flex items-center gap-3 p-2 bg-zinc-800/30 rounded-xl border border-zinc-700/40">
									<img
										src={selectedGeneration.referenceImageUrl}
										alt="Reference"
										class="w-12 h-12 rounded-lg object-cover"
									/>
									<div class="text-sm">
										<span class="text-zinc-300">Strength:</span>
										<span class="text-white font-medium ml-1">{selectedGeneration.referenceStrength ?? 60}%</span>
									</div>
								</div>
							</div>
						{/if}

						<div class="mb-4 p-3 bg-zinc-800/25 rounded-xl border border-zinc-700/40">
							<div class="flex items-center justify-between text-sm">
								<span class="text-zinc-400">Token Cost</span>
								<span class="text-white font-medium">{selectedGeneration.tokenCost}</span>
							</div>
							{#if selectedGeneration.mode === 'remix'}
								<div class="flex items-center justify-between text-sm mt-2">
									<span class="text-zinc-400">Mode</span>
									<span class="text-white font-medium">Remix</span>
								</div>
							{/if}
							{#if selectedGeneration.controlMethod}
								<div class="flex items-center justify-between text-sm mt-2">
									<span class="text-zinc-400">Control</span>
									<span class="text-white font-medium capitalize">{selectedGeneration.controlMethod}</span>
								</div>
							{/if}
							{#if selectedGeneration.style}
								<div class="flex items-center justify-between text-sm mt-2">
									<span class="text-zinc-400">Style</span>
									<span class="text-white font-medium capitalize">{selectedGeneration.style.replace('-', ' ')}</span>
								</div>
							{/if}
							{#if selectedGeneration.seed}
								<div class="flex items-center justify-between text-sm mt-2">
									<span class="text-zinc-400">Seed</span>
									<span class="text-white font-medium">{selectedGeneration.seed}</span>
								</div>
							{/if}
						</div>

						<div class="flex gap-2">
							<button onclick={downloadImage} class="btn-download flex-1">
								<Download class="w-4 h-4" />
								Download
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
	/* Mode tabs */
	.mode-tabs {
		display: flex;
		gap: .25rem;
		padding: .25rem;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.3);
		border-radius: .6rem;
	}
	.mode-tab {
		flex: 1;
		display: flex; align-items: center; justify-content: center; gap: .4rem;
		padding: .5rem .75rem;
		font-size: .8125rem; font-weight: 500;
		color: #a1a1aa;
		background: none; border: none; border-radius: .45rem;
		cursor: pointer;
		transition: all .2s;
	}
	.mode-tab:hover { color: #fff; background: rgba(63,63,70,.3); }
	.mode-tab-active {
		color: #fbbf24;
		background: rgba(245,158,11,.1);
		box-shadow: 0 0 0 1px rgba(245,158,11,.25);
	}
	.beta-badge {
		font-size: .6rem;
		font-weight: 700;
		letter-spacing: .04em;
		text-transform: uppercase;
		padding: .1rem .35rem;
		border-radius: 2rem;
		background: rgba(139,92,246,.15);
		color: #a78bfa;
		line-height: 1;
	}

	/* Remix dropzone */
	.remix-dropzone {
		position: relative;
		aspect-ratio: 1/1;
		background: rgba(39,39,42,.25);
		border: 2px dashed rgba(63,63,70,.5);
		border-radius: .5rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		cursor: pointer;
		transition: border-color .2s, background .2s;
	}
	.remix-dropzone:hover {
		border-color: rgba(63,63,70,.8);
		background: rgba(39,39,42,.4);
	}
	.remix-preview-img {
		width: 100%; aspect-ratio: 1/1;
		object-fit: cover;
		border-radius: .5rem;
		border: 1px solid rgba(63,63,70,.4);
	}

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

	/* Preview panel */
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
	.preview-content {
		background: rgba(9,9,11,.4);
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

	/* Style pill buttons */
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

	/* Reference image section */
	.ref-toggle {
		width: 100%;
		display: flex; align-items: center; justify-content: space-between;
		padding: .55rem .75rem;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .6rem;
		cursor: pointer;
		transition: background .2s;
	}
	.ref-toggle:hover { background: rgba(39,39,42,.5); }
	.ref-badge {
		font-size: .65rem;
		padding: .1rem .4rem;
		background: rgba(245,158,11,.15);
		color: #fbbf24;
		border-radius: 2rem;
	}
	.ref-content {
		margin-top: .5rem;
		padding: .75rem;
		background: rgba(39,39,42,.2);
		border: 1px solid rgba(63,63,70,.25);
		border-radius: .6rem;
	}
	.ref-dropzone {
		position: relative;
		aspect-ratio: 16/9;
		background: rgba(39,39,42,.25);
		border: 2px dashed rgba(63,63,70,.5);
		border-radius: .5rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		cursor: pointer;
		transition: border-color .2s, background .2s;
	}
	.ref-dropzone:hover {
		border-color: rgba(63,63,70,.8);
		background: rgba(39,39,42,.4);
	}
	.ref-preview {
		position: relative;
		display: inline-block;
	}
	.ref-preview-img {
		width: 5rem; height: 5rem;
		object-fit: cover;
		border-radius: .5rem;
		border: 1px solid rgba(63,63,70,.4);
	}
	.ref-clear {
		position: absolute; top: -.35rem; right: -.35rem;
		width: 1.25rem; height: 1.25rem;
		border-radius: 50%;
		background: #27272a;
		border: 1px solid rgba(63,63,70,.5);
		display: flex; align-items: center; justify-content: center;
		color: #a1a1aa;
		cursor: pointer;
		transition: background .2s, color .2s;
	}
	.ref-clear:hover { background: #3f3f46; color: #fff; }
	.ref-slider {
		width: 100%;
		height: .35rem;
		appearance: none;
		background: rgba(63,63,70,.4);
		border-radius: .2rem;
		outline: none;
	}
	.ref-slider::-webkit-slider-thumb {
		appearance: none;
		width: .85rem; height: .85rem;
		border-radius: 50%;
		background: #fbbf24;
		cursor: pointer;
		border: 2px solid #18181b;
	}
	.ref-slider::-moz-range-thumb {
		width: .85rem; height: .85rem;
		border-radius: 50%;
		background: #fbbf24;
		cursor: pointer;
		border: 2px solid #18181b;
	}

	/* Aspect ratio buttons */
	.ratio-btn {
		display: flex; flex-direction: column; align-items: center; gap: .3rem;
		padding: .45rem .6rem;
		background: rgba(39,39,42,.4);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .55rem;
		color: #a1a1aa;
		cursor: pointer;
		transition: all .2s;
		flex: 1;
	}
	.ratio-btn:hover { background: rgba(63,63,70,.5); color: #fff; }
	.ratio-btn-active {
		background: rgba(245,158,11,.1);
		border-color: rgba(245,158,11,.4);
		color: #fbbf24;
	}
	.ratio-icon {
		height: 1.6rem;
		border: 1.5px solid currentColor;
		border-radius: .2rem;
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
