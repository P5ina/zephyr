<script lang="ts">
import {
	ArrowDown,
	ArrowDownLeft,
	ArrowDownRight,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	ArrowUpLeft,
	ArrowUpRight,
	Check,
	ChevronLeft,
	ChevronRight,
	Download,
	Expand,
	Grid3x3,
	ImagePlus,
	Loader2,
	Pause,
	Play,
	Plus,
	RotateCw,
	Sparkles,
	Upload,
	X,
} from 'lucide-svelte';
import { track } from '@vercel/analytics';
import JSZip from 'jszip';
import { PRICING } from '$lib/pricing';
import { tokenState } from '$lib/token-state.svelte';
import type { RotationJob } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialJobs = data.rotationJobs;
// svelte-ignore state_referenced_locally
const sprites = data.sprites;

// View mode: 'new' for creating new generation, or job ID for viewing existing
let viewMode = $state<'new' | string>(
	initialJobs.length > 0 ? initialJobs[0].id : 'new',
);

// Input state for new generation
let selectedImageUrl = $state<string | null>(null);
let uploadedFile = $state<File | null>(null);
let uploadPreviewUrl = $state<string | null>(null);
let showSpriteSelector = $state(false);
let elevation = $state(20);

// Generation state
let generating = $state(false);
let currentGeneratingId = $state<string | null>(null);

// History
let rotationJobs = $state<RotationJob[]>(initialJobs);

// Track polling
const pollingSet = new Set<string>();

const TOKEN_COST = PRICING.tokenCosts.rotation;

// Viewer state
let showViewer = $state(false);
let viewerDirection = $state(0);
let isPlaying = $state(false);
let animationSpeed = $state(200);
let animationInterval: ReturnType<typeof setInterval> | null = null;

const animationOrder = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'] as const;

const directions = [
	{ key: 'nw', label: 'NW', icon: ArrowUpLeft, angle: 315 },
	{ key: 'n', label: 'N', icon: ArrowUp, angle: 0 },
	{ key: 'ne', label: 'NE', icon: ArrowUpRight, angle: 45 },
	{ key: 'w', label: 'W', icon: ArrowLeft, angle: 270 },
	{ key: 'center', label: '', icon: null, angle: -1 },
	{ key: 'e', label: 'E', icon: ArrowRight, angle: 90 },
	{ key: 'sw', label: 'SW', icon: ArrowDownLeft, angle: 225 },
	{ key: 's', label: 'S', icon: ArrowDown, angle: 180 },
	{ key: 'se', label: 'SE', icon: ArrowDownRight, angle: 135 },
] as const;

const selectedJob = $derived(
	viewMode !== 'new' ? rotationJobs.find((j) => j.id === viewMode) : null,
);

const displayRotations = $derived(
	selectedJob
		? {
				n: selectedJob.rotationN,
				ne: selectedJob.rotationNE,
				e: selectedJob.rotationE,
				se: selectedJob.rotationSE,
				s: selectedJob.rotationS,
				sw: selectedJob.rotationSW,
				w: selectedJob.rotationW,
				nw: selectedJob.rotationNW,
			}
		: {
				n: null,
				ne: null,
				e: null,
				se: null,
				s: null,
				sw: null,
				w: null,
				nw: null,
			},
);

const hasAnyRotation = $derived(
	Object.values(displayRotations).some((v) => v !== null),
);
const hasImageSelected = $derived(
	selectedImageUrl !== null || uploadedFile !== null,
);
const previewUrl = $derived(uploadPreviewUrl || selectedImageUrl);

$effect(() => {
	for (const job of initialJobs) {
		if (
			job.status !== 'completed' &&
			job.status !== 'failed' &&
			!pollingSet.has(job.id)
		) {
			pollingSet.add(job.id);
			pollJobStatus(job.id);
		}
	}
});

$effect(() => {
	if (uploadedFile) {
		const url = URL.createObjectURL(uploadedFile);
		uploadPreviewUrl = url;
		selectedImageUrl = null;
		return () => URL.revokeObjectURL(url);
	} else {
		uploadPreviewUrl = null;
	}
});

function handleFileSelect(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) {
		uploadedFile = file;
	}
}

function handleDrop(event: DragEvent) {
	event.preventDefault();
	const file = event.dataTransfer?.files[0];
	if (file?.type.startsWith('image/')) {
		uploadedFile = file;
	}
}

function handleDragOver(event: DragEvent) {
	event.preventDefault();
}

function selectSprite(url: string) {
	selectedImageUrl = url;
	uploadedFile = null;
	showSpriteSelector = false;
}

function clearSelection() {
	selectedImageUrl = null;
	uploadedFile = null;
}

function startNewGeneration() {
	viewMode = 'new';
	clearSelection();
}

function selectJob(jobId: string) {
	viewMode = jobId;
}

async function generate() {
	if (!hasImageSelected || generating) return;
	if (tokenState.total < TOKEN_COST) {
		alert('Not enough tokens');
		return;
	}

	generating = true;

	try {
		const formData = new FormData();

		if (uploadedFile) {
			formData.append('image', uploadedFile);
		} else if (selectedImageUrl) {
			formData.append('imageUrl', selectedImageUrl);
		}
		formData.append('elevation', elevation.toString());

		const res = await fetch('/api/rotate/generate', {
			method: 'POST',
			body: formData,
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			generating = false;
			return;
		}

		const result = await res.json();
		tokenState.tokens = result.tokensRemaining ?? tokenState.tokens;
		tokenState.bonusTokens = result.bonusTokensRemaining ?? tokenState.bonusTokens;

		if (result.job) {
			rotationJobs = [result.job, ...rotationJobs];
			currentGeneratingId = result.job.id;
			viewMode = result.job.id;
			pollingSet.add(result.job.id);
			clearSelection();

			track('generation_started', { type: 'rotation' });

			pollJobStatus(result.job.id);
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate rotations');
		generating = false;
	}
}

async function pollJobStatus(id: string) {
	let retryCount = 0;
	const maxRetries = 5;

	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/rotate/${id}/status`);
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
				}
				return;
			}

			retryCount = 0;
			const result = await res.json();

			rotationJobs = rotationJobs.map((j) =>
				j.id === id
					? {
							...j,
							status: result.status,
							progress: result.progress,
							currentStage: result.statusMessage,
							runpodJobId: result.runpodJobId || j.runpodJobId,
							rotationN: result.rotations?.n,
							rotationNE: result.rotations?.ne,
							rotationE: result.rotations?.e,
							rotationSE: result.rotations?.se,
							rotationS: result.rotations?.s,
							rotationSW: result.rotations?.sw,
							rotationW: result.rotations?.w,
							rotationNW: result.rotations?.nw,
						}
					: j,
			);

			if (result.status === 'completed' || result.status === 'failed') {
				pollingSet.delete(id);
				if (currentGeneratingId === id) {
					generating = false;
					currentGeneratingId = null;
				}

				if (result.status === 'completed') {
					track('generation_completed', { type: 'rotation' });
				}

				if (
					result.status === 'failed' &&
					result.error &&
					!result.error.includes('Cancelled by user')
				) {
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

async function downloadRotation(direction: string) {
	const url = displayRotations[direction as keyof typeof displayRotations];
	if (!url) return;

	try {
		const blob = await fetchAsBlob(url);
		const blobUrl = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = `sprite_${direction}.png`;
		a.click();
		URL.revokeObjectURL(blobUrl);
	} catch {
		window.open(url, '_blank');
	}
}

async function downloadAll() {
	downloading = true;
	try {
		const zip = new JSZip();
		const entries = Object.entries(displayRotations) as [string, string | null][];
		await Promise.all(
			entries
				.filter(([, url]) => url)
				.map(async ([dir, url]) => {
					const blob = await fetchAsBlob(url!);
					zip.file(`sprite_${dir}.png`, blob);
				}),
		);
		const zipBlob = await zip.generateAsync({ type: 'blob' });
		const blobUrl = URL.createObjectURL(zipBlob);
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = 'rotation_8dir.zip';
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

function getJobPreviewImage(job: RotationJob): string | null {
	return (
		job.rotationS || job.rotationN || job.rotationE || job.rotationW || null
	);
}

function openViewer() {
	if (!hasAnyRotation) return;
	showViewer = true;
	viewerDirection = 0;
}

function closeViewer() {
	showViewer = false;
	stopAnimation();
}

function nextDirection() {
	viewerDirection = (viewerDirection + 1) % animationOrder.length;
}

function prevDirection() {
	viewerDirection =
		(viewerDirection - 1 + animationOrder.length) % animationOrder.length;
}

function togglePlay() {
	if (isPlaying) {
		stopAnimation();
	} else {
		startAnimation();
	}
}

function startAnimation() {
	if (animationInterval) clearInterval(animationInterval);
	isPlaying = true;
	animationInterval = setInterval(() => {
		viewerDirection = (viewerDirection + 1) % animationOrder.length;
	}, animationSpeed);
}

function stopAnimation() {
	isPlaying = false;
	if (animationInterval) {
		clearInterval(animationInterval);
		animationInterval = null;
	}
}

function changeSpeed(newSpeed: number) {
	animationSpeed = newSpeed;
	if (isPlaying) {
		if (animationInterval) clearInterval(animationInterval);
		animationInterval = setInterval(() => {
			viewerDirection = (viewerDirection + 1) % animationOrder.length;
		}, animationSpeed);
	}
}

$effect(() => {
	return () => {
		if (animationInterval) clearInterval(animationInterval);
	};
});

const currentViewerImage = $derived(
	displayRotations[
		animationOrder[viewerDirection] as keyof typeof displayRotations
	],
);
const currentViewerLabel = $derived(
	animationOrder[viewerDirection].toUpperCase(),
);

async function exportSpritesheet() {
	if (!hasAnyRotation) return;

	const images: HTMLImageElement[] = [];
	const loadPromises: Promise<void>[] = [];

	for (const dir of animationOrder) {
		const url = displayRotations[dir as keyof typeof displayRotations];
		if (url) {
			const img = new Image();
			img.crossOrigin = 'anonymous';
			const promise = new Promise<void>((resolve, reject) => {
				img.onload = () => resolve();
				img.onerror = () => reject(new Error(`Failed to load ${dir}`));
			});
			img.src = url;
			images.push(img);
			loadPromises.push(promise);
		}
	}

	try {
		await Promise.all(loadPromises);

		if (images.length === 0) return;

		const imgWidth = images[0].width;
		const imgHeight = images[0].height;

		const canvas = document.createElement('canvas');
		canvas.width = imgWidth * images.length;
		canvas.height = imgHeight;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		images.forEach((img, i) => {
			ctx.drawImage(img, i * imgWidth, 0);
		});

		const link = document.createElement('a');
		link.download = 'spritesheet.png';
		link.href = canvas.toDataURL('image/png');
		link.click();
	} catch (e) {
		console.error('Failed to export spritesheet:', e);
		alert('Failed to export spritesheet');
	}
}

async function cancelJob(id: string) {
	if (!confirm('Cancel this generation? Tokens will be refunded.')) return;

	try {
		const res = await fetch(`/api/rotate/${id}/cancel`, { method: 'POST' });
		if (res.ok) {
			const result = await res.json();
			rotationJobs = rotationJobs.map((j) =>
				j.id === id
					? { ...j, status: 'failed', errorMessage: 'Cancelled by user' }
					: j,
			);
			pollingSet.delete(id);
			if (currentGeneratingId === id) {
				generating = false;
				currentGeneratingId = null;
			}
			tokens = tokens + (result.regularTokensRefunded ?? 0);
			bonusTokens = bonusTokens + (result.bonusTokensRefunded ?? 0);
		} else {
			const error = await res.json();
			alert(error.message || 'Failed to cancel');
		}
	} catch {
		alert('Failed to cancel generation');
	}
}

function getSpriteUrl(sprite: (typeof sprites)[number]): string | null {
	const urls = sprite.resultUrls as { processed?: string; raw?: string } | null;
	return urls?.processed || urls?.raw || null;
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

			{#if rotationJobs.length > 0}
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
				{#each rotationJobs as job (job.id)}
					<button
						onclick={() => selectJob(job.id)}
						class="history-thumb {viewMode === job.id ? 'history-thumb-active' : ''}"
					>
						{#if job.status === 'completed'}
							{#if getJobPreviewImage(job)}
								<img
									src={getJobPreviewImage(job)}
									alt="Rotation"
									class="w-full h-full object-contain bg-zinc-800"
								/>
							{:else}
								<div class="w-full h-full bg-zinc-800 flex items-center justify-center">
									<Check class="w-5 h-5 text-green-400" />
								</div>
							{/if}
						{:else if job.status === 'failed'}
							<div class="w-full h-full bg-zinc-800 flex items-center justify-center">
								<X class="w-5 h-5 text-red-400" />
							</div>
						{:else}
							<div class="w-full h-full bg-zinc-800 flex flex-col items-center justify-center">
								<Loader2 class="w-5 h-5 animate-spin text-amber-400" />
							</div>
						{/if}
						{#if viewMode === job.id}
							<div class="absolute top-1 right-1 w-3 h-3 bg-amber-500 rounded-full flex items-center justify-center">
								<Check class="w-2 h-2 text-zinc-900" />
							</div>
						{/if}
					</button>
				{/each}
			</div>

			{#if rotationJobs.length > 0}
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
		<!-- Left Panel -->
		<div class="panel">
			{#if viewMode === 'new'}
				<h2 class="panel-title">New Rotation</h2>

				{#if previewUrl}
					<div class="relative aspect-square bg-zinc-800/40 rounded-xl border border-zinc-700/50 overflow-hidden mb-4">
						<img
							src={previewUrl}
							alt="Selected sprite for rotation"
							class="w-full h-full object-contain"
						/>
						<button
							onclick={clearSelection}
							class="absolute top-2 right-2 p-1.5 bg-black/50 hover:bg-black/70 rounded-lg transition-colors backdrop-blur-sm"
						>
							<X class="w-4 h-4 text-white" />
						</button>
					</div>
				{:else}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						ondrop={handleDrop}
						ondragover={handleDragOver}
						ondragleave={(e) => e.preventDefault()}
						role="button"
						tabindex="0"
						aria-label="Drop zone for image upload"
						class="drop-zone mb-4"
					>
						<input
							type="file"
							accept="image/png,image/jpeg,image/webp"
							onchange={handleFileSelect}
							class="absolute inset-0 opacity-0 cursor-pointer"
							id="file-input"
						/>
						<label for="file-input" class="flex flex-col items-center cursor-pointer p-8">
							<Upload class="w-10 h-10 text-zinc-500 mb-3" />
							<p class="text-sm text-zinc-400 text-center mb-1">
								Drag & drop or click to upload
							</p>
							<p class="text-xs text-zinc-500">PNG, JPEG, WebP up to 10MB</p>
						</label>
					</div>
				{/if}

				{#if sprites.length > 0}
					<div class="relative mb-4">
						<button
							onclick={() => showSpriteSelector = !showSpriteSelector}
							class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800/40 hover:bg-zinc-800/60 border border-zinc-700/50 rounded-xl text-sm text-zinc-300 transition-colors"
						>
							<ImagePlus class="w-4 h-4" />
							Select from your sprites
						</button>

						{#if showSpriteSelector}
							<div class="sprite-selector">
								<div class="grid grid-cols-5 gap-2">
									{#each sprites as sprite (sprite.id)}
										{@const url = getSpriteUrl(sprite)}
										{#if url}
											<button
												onclick={() => selectSprite(url)}
												class="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700/50 hover:border-amber-500/40 transition-colors"
											>
												<img src={url} alt={sprite.prompt} class="w-full h-full object-contain" />
											</button>
										{/if}
									{/each}
								</div>
							</div>
						{/if}
					</div>
				{/if}

				<!-- Elevation Slider -->
				<div class="mb-4">
					<div class="flex items-center justify-between mb-2">
						<label for="elevation" class="text-sm text-zinc-400">Camera Elevation</label>
						<span class="text-sm text-zinc-300 font-medium">{elevation}&deg;</span>
					</div>
					<input
						type="range"
						id="elevation"
						bind:value={elevation}
						min="-90"
						max="90"
						step="5"
						class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-amber-500"
					/>
					<div class="flex justify-between text-xs text-zinc-500 mt-1">
						<span>-90&deg; (below)</span>
						<span>0&deg; (level)</span>
						<span>90&deg; (above)</span>
					</div>
				</div>

				<button
					onclick={generate}
					disabled={!hasImageSelected || generating || tokenState.total < TOKEN_COST}
					class="btn-generate"
				>
					{#if generating}
						<Loader2 class="w-4 h-4 animate-spin" />
						Generating...
					{:else}
						<Sparkles class="w-4 h-4" />
						Generate ({TOKEN_COST} tokens)
					{/if}
				</button>

				<p class="text-xs text-zinc-500 mt-3 text-center">
					Upload a front-facing image to generate 8-directional views
				</p>
			{:else if selectedJob}
				<div class="flex items-center justify-between mb-4">
					<h2 class="panel-title" style="margin-bottom:0">
						{#if selectedJob.status === 'processing'}
							Generating...
						{:else if selectedJob.status === 'completed'}
							Rotation Complete
						{:else if selectedJob.status === 'failed'}
							Generation Failed
						{:else}
							Queued
						{/if}
					</h2>
					<span class="text-xs text-zinc-500">{formatDate(selectedJob.createdAt)}</span>
				</div>

				{#if selectedJob.runpodJobId}
					<div class="mb-3 text-xs text-zinc-500 font-mono">
						Job: {selectedJob.runpodJobId}
					</div>
				{/if}

				{#if selectedJob.status === 'processing' || selectedJob.status === 'pending'}
					<div class="aspect-square bg-zinc-800/25 rounded-xl border border-zinc-700/40 flex flex-col items-center justify-center mb-4">
						<Loader2 class="w-12 h-12 animate-spin text-amber-400 mb-4" />
						<p class="text-sm text-zinc-300">{selectedJob.currentStage || 'Processing...'}</p>
					</div>
					<button
						onclick={() => selectedJob && cancelJob(selectedJob.id)}
						class="btn-cancel"
					>
						<X class="w-4 h-4" />
						Cancel Generation
					</button>
				{:else if selectedJob.status === 'failed'}
					<div class="aspect-square bg-red-500/5 rounded-xl border border-red-500/15 flex flex-col items-center justify-center mb-4 p-6">
						<X class="w-12 h-12 text-red-400 mb-4" />
						<p class="text-sm text-red-300 text-center mb-2">Generation failed</p>
						{#if selectedJob.errorMessage}
							<p class="text-xs text-red-400/70 text-center">{selectedJob.errorMessage}</p>
						{/if}
					</div>
					<button onclick={startNewGeneration} class="btn-secondary w-full">
						<Plus class="w-4 h-4" />
						Try Again
					</button>
				{:else if selectedJob.status === 'completed'}
					{#if selectedJob.inputImageUrl}
						<div class="mb-4">
							<span class="text-xs text-zinc-500 mb-2 block">Input Image</span>
							<div class="aspect-square bg-zinc-800/40 rounded-xl border border-zinc-700/50 overflow-hidden">
								<img
									src={selectedJob.inputImageUrl}
									alt="Input"
									class="w-full h-full object-contain"
								/>
							</div>
						</div>
					{/if}

					<div class="mb-4 p-3 bg-zinc-800/25 rounded-xl border border-zinc-700/40">
						<div class="flex items-center justify-between text-sm">
							<span class="text-zinc-400">Camera Elevation</span>
							<span class="text-white font-medium">{selectedJob.elevation ?? 20}&deg;</span>
						</div>
					</div>

					<button onclick={startNewGeneration} class="btn-secondary w-full">
						<Plus class="w-4 h-4" />
						New Rotation
					</button>
				{/if}
			{/if}
		</div>

		<!-- Right Panel: 8-Direction Grid -->
		<div class="panel">
			<div class="flex items-center justify-between mb-4">
				<h2 class="panel-title" style="margin-bottom:0">8-Direction Output</h2>
				{#if hasAnyRotation}
					<div class="flex items-center gap-2">
						<button onclick={openViewer} class="btn-sm btn-sm-gold" title="Open viewer">
							<Expand class="w-3.5 h-3.5" />
							View
						</button>
						<button onclick={exportSpritesheet} class="btn-sm" title="Export as spritesheet">
							<Grid3x3 class="w-3.5 h-3.5" />
							Spritesheet
						</button>
					</div>
				{/if}
			</div>

			<div class="dir-grid">
				{#each directions as dir}
					{#if dir.key === 'center'}
						<div class="dir-cell dir-cell-center">
							<RotateCw class="w-8 h-8 text-zinc-600" />
						</div>
					{:else}
						{@const url = displayRotations[dir.key as keyof typeof displayRotations]}
						<button
							onclick={() => {
								if (url) {
									const idx = animationOrder.indexOf(dir.key as typeof animationOrder[number]);
									if (idx !== -1) {
										viewerDirection = idx;
										showViewer = true;
									}
								}
							}}
							class="dir-cell {url ? 'dir-cell-filled' : 'dir-cell-empty'}"
						>
							{#if url}
								<img src={url} alt={dir.label} class="w-full h-full object-contain" />
								<div class="dir-cell-hover">
									<Expand class="w-5 h-5 text-white" />
								</div>
							{:else if selectedJob?.status === 'processing'}
								<Loader2 class="w-5 h-5 animate-spin text-zinc-600" />
							{:else}
								{@const Icon = dir.icon}
								<Icon class="w-6 h-6 text-zinc-600 mb-1" />
								<span class="text-[10px] text-zinc-500">{dir.label}</span>
							{/if}
						</button>
					{/if}
				{/each}
			</div>

			{#if hasAnyRotation}
				<button onclick={downloadAll} disabled={downloading} class="btn-download-all">
					{#if downloading}
						<Loader2 class="w-4 h-4 animate-spin" />
						Preparing zip...
					{:else}
						<Download class="w-4 h-4" />
						Download All
					{/if}
				</button>
			{/if}

			<div class="mt-4 pt-4 border-t border-zinc-800/50">
				<p class="text-xs text-zinc-500 text-center">
					N = Front &bull; S = Back &bull; E = Right &bull; W = Left
				</p>
			</div>

			{#if viewMode === 'new'}
				<div class="mt-4 pt-4 border-t border-zinc-800/50">
					<p class="text-xs text-zinc-400 mb-2">Tips for best results:</p>
					<ul class="text-xs text-zinc-500 space-y-1">
						<li>Use front-facing images with clear subjects</li>
						<li>White or transparent backgrounds work best</li>
						<li>Higher resolution inputs = better results</li>
					</ul>
				</div>
			{/if}
		</div>
	</div>
</div>

<!-- Sprite Viewer Modal -->
{#if showViewer}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop"
		onclick={(e) => e.target === e.currentTarget && closeViewer()}
		onkeydown={(e) => {
			if (e.key === 'Escape') closeViewer();
			if (e.key === 'ArrowLeft') prevDirection();
			if (e.key === 'ArrowRight') nextDirection();
			if (e.key === ' ') { e.preventDefault(); togglePlay(); }
		}}
		role="dialog"
		tabindex="-1"
	>
		<div class="relative w-full max-w-3xl max-h-full flex flex-col">
			<button
				onclick={closeViewer}
				class="absolute -top-2 -right-2 z-10 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
			>
				<X class="w-5 h-5" />
			</button>

			<div class="viewer-shell">
				<div class="viewer-stage">
					{#if currentViewerImage}
						<img
							src={currentViewerImage}
							alt={currentViewerLabel}
							class="max-w-full max-h-[50vh] object-contain"
						/>
					{:else}
						<div class="text-zinc-500">No image</div>
					{/if}

					<div class="viewer-label">{currentViewerLabel}</div>

					<button
						onclick={prevDirection}
						class="viewer-nav viewer-nav-left"
					>
						<ChevronLeft class="w-5 h-5 text-white" />
					</button>
					<button
						onclick={nextDirection}
						class="viewer-nav viewer-nav-right"
					>
						<ChevronRight class="w-5 h-5 text-white" />
					</button>
				</div>

				<div class="viewer-controls">
					<div class="flex items-center justify-center gap-1">
						{#each animationOrder as dir, i}
							{@const url = displayRotations[dir as keyof typeof displayRotations]}
							<button
								onclick={() => { viewerDirection = i; }}
								class="viewer-thumb {viewerDirection === i ? 'viewer-thumb-active' : ''}"
							>
								{#if url}
									<img src={url} alt={dir.toUpperCase()} class="w-full h-full object-contain bg-zinc-800" />
								{:else}
									<div class="w-full h-full bg-zinc-800 flex items-center justify-center text-[8px] text-zinc-500">
										{dir.toUpperCase()}
									</div>
								{/if}
							</button>
						{/each}
					</div>

					<div class="flex items-center justify-center gap-3 flex-wrap">
						<button
							onclick={togglePlay}
							class="btn-sm {isPlaying ? 'btn-sm-gold' : ''}"
						>
							{#if isPlaying}
								<Pause class="w-4 h-4" />
								Pause
							{:else}
								<Play class="w-4 h-4" />
								Play
							{/if}
						</button>

						<div class="flex items-center gap-2">
							<span class="text-xs text-zinc-400">Speed:</span>
							<select
								value={animationSpeed}
								onchange={(e) => changeSpeed(Number((e.target as HTMLSelectElement).value))}
								class="field-select"
							>
								<option value={400}>Slow</option>
								<option value={200}>Normal</option>
								<option value={100}>Fast</option>
								<option value={50}>Very Fast</option>
							</select>
						</div>

						<div class="w-px h-6 bg-zinc-700/50"></div>

						<button onclick={exportSpritesheet} class="btn-sm">
							<Grid3x3 class="w-4 h-4" />
							Spritesheet
						</button>
						<button onclick={downloadAll} class="btn-sm btn-sm-gold">
							<Download class="w-4 h-4" />
							Download
						</button>
					</div>

					<div class="text-center text-xs text-zinc-500 pt-2 border-t border-zinc-800/40">
						<span class="inline-flex items-center gap-4 flex-wrap justify-center">
							<span><kbd class="kbd">&#8592;</kbd> <kbd class="kbd">&#8594;</kbd> Navigate</span>
							<span><kbd class="kbd">Space</kbd> Play/Pause</span>
							<span><kbd class="kbd">Esc</kbd> Close</span>
						</span>
					</div>
				</div>
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

	/* Drop zone */
	.drop-zone {
		position: relative;
		aspect-ratio: 1;
		background: rgba(39,39,42,.2);
		border: 2px dashed rgba(63,63,70,.5);
		border-radius: .85rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		cursor: pointer;
		transition: border-color .2s;
	}
	.drop-zone:hover { border-color: rgba(63,63,70,.7); }

	/* Sprite selector */
	.sprite-selector {
		position: absolute; left: 0; right: 0; margin-top: .5rem;
		padding: .75rem;
		background: rgba(24,24,27,.95);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .75rem;
		box-shadow: 0 8px 32px rgba(0,0,0,.4);
		z-index: 10;
		max-height: 12rem; overflow-y: auto;
		backdrop-filter: blur(12px);
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

	/* Buttons */
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

	/* Direction grid */
	.dir-grid {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem;
	}
	.dir-cell {
		aspect-ratio: 1;
		border-radius: .65rem;
		overflow: hidden;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		position: relative;
		border: none; cursor: default;
		background: rgba(39,39,42,.35);
		border: 1px solid rgba(63,63,70,.35);
		transition: border-color .2s;
	}
	.dir-cell-center {
		background: rgba(39,39,42,.25);
		border-color: rgba(63,63,70,.5);
	}
	.dir-cell-filled { cursor: pointer; }
	.dir-cell-filled:hover { border-color: rgba(245,158,11,.3); }
	.dir-cell-hover {
		position: absolute; inset: 0;
		background: rgba(0,0,0,.55);
		opacity: 0;
		display: flex; align-items: center; justify-content: center;
		transition: opacity .2s;
	}
	.dir-cell-filled:hover .dir-cell-hover { opacity: 1; }

	/* Download All */
	.btn-download-all {
		width: 100%; margin-top: 1rem;
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		padding: .7rem 1rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-weight: 600; font-size: .875rem;
		border-radius: .65rem; border: none; cursor: pointer;
		box-shadow: 0 0 20px rgba(245,158,11,.12);
		transition: box-shadow .25s, transform .15s;
	}
	.btn-download-all:hover:not(:disabled) {
		box-shadow: 0 0 28px rgba(245,158,11,.25);
		transform: translateY(-1px);
	}
	.btn-download-all:disabled {
		opacity: .7; cursor: wait;
	}

	/* Modal */
	.modal-backdrop {
		position: fixed; inset: 0;
		background: rgba(0,0,0,.75);
		backdrop-filter: blur(6px);
		z-index: 50;
		display: flex; align-items: center; justify-content: center;
		padding: 1rem;
	}

	/* Viewer */
	.viewer-shell {
		background: rgba(24,24,27,.95);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: 1rem;
		overflow: hidden;
		display: flex; flex-direction: column;
		max-height: calc(100vh - 2rem);
		backdrop-filter: blur(12px);
	}
	.viewer-stage {
		position: relative; flex: 1; min-height: 0;
		background: rgba(39,39,42,.3);
		display: flex; align-items: center; justify-content: center;
		padding: 2rem;
	}
	.viewer-label {
		position: absolute; top: .75rem; left: .75rem;
		padding: .3rem .7rem;
		background: rgba(0,0,0,.5);
		border-radius: .5rem;
		color: #fff; font-weight: 600; font-size: .8125rem;
		backdrop-filter: blur(8px);
	}
	.viewer-nav {
		position: absolute; top: 50%; transform: translateY(-50%);
		padding: .5rem;
		background: rgba(0,0,0,.5);
		border-radius: 9999px;
		border: none; cursor: pointer;
		transition: background .2s;
		backdrop-filter: blur(8px);
	}
	.viewer-nav:hover { background: rgba(0,0,0,.7); }
	.viewer-nav-left { left: .5rem; }
	.viewer-nav-right { right: .5rem; }
	.viewer-controls {
		padding: 1rem;
		border-top: 1px solid rgba(63,63,70,.3);
		display: flex; flex-direction: column; gap: .75rem;
	}
	.viewer-thumb {
		width: 2.5rem; height: 2.5rem;
		border-radius: .35rem;
		border: 2px solid rgba(63,63,70,.4);
		overflow: hidden;
		background: none; cursor: pointer;
		transition: border-color .2s;
	}
	.viewer-thumb:hover { border-color: rgba(63,63,70,.6); }
	.viewer-thumb-active { border-color: rgba(245,158,11,.5); }

	/* Select field */
	.field-select {
		padding: .25rem .5rem;
		background: rgba(39,39,42,.5);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .35rem;
		color: #fff; font-size: .8125rem;
	}
	.field-select:focus {
		outline: none;
		border-color: rgba(245,158,11,.35);
	}

	/* Kbd */
	.kbd {
		padding: .1rem .35rem;
		background: rgba(39,39,42,.5);
		border-radius: .25rem;
		font-size: .6875rem;
	}
</style>
