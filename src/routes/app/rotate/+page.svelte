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
import { PRICING } from '$lib/pricing';
import type { RotationJob } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialJobs = data.rotationJobs;
// svelte-ignore state_referenced_locally
const sprites = data.sprites;

// svelte-ignore state_referenced_locally
let tokens = $state(data.user.tokens);
// svelte-ignore state_referenced_locally
let bonusTokens = $state(data.user.bonusTokens);

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
let viewerDirection = $state(0); // Index into animationOrder
let isPlaying = $state(false);
let animationSpeed = $state(200); // ms per frame
let animationInterval: ReturnType<typeof setInterval> | null = null; // Not reactive

// Animation order for cycling through directions (clockwise starting from N)
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

// Derived: currently selected job (if viewing existing)
const selectedJob = $derived(
	viewMode !== 'new' ? rotationJobs.find((j) => j.id === viewMode) : null,
);

// Derived: rotations to display
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

// Start polling for any pending jobs on page load
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

// Clean up preview URL when file changes
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
	if (tokens + bonusTokens < TOKEN_COST) {
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
		tokens = result.tokensRemaining ?? tokens;
		bonusTokens = result.bonusTokensRemaining ?? bonusTokens;

		if (result.job) {
			rotationJobs = [result.job, ...rotationJobs];
			currentGeneratingId = result.job.id;
			viewMode = result.job.id;
			pollingSet.add(result.job.id);
			clearSelection();
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
				if (result.status === 'failed') {
					alert(result.error || 'Generation failed');
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

function downloadRotation(direction: string) {
	const url = displayRotations[direction as keyof typeof displayRotations];
	if (!url) return;

	const a = document.createElement('a');
	a.href = url;
	a.download = `sprite_${direction}.png`;
	a.click();
}

function downloadAll() {
	for (const dir of Object.keys(
		displayRotations,
	) as (keyof typeof displayRotations)[]) {
		if (displayRotations[dir]) {
			setTimeout(() => downloadRotation(dir), 100);
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

function getJobPreviewImage(job: RotationJob): string | null {
	return (
		job.rotationS || job.rotationN || job.rotationE || job.rotationW || null
	);
}

// Viewer functions
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
		// Restart with new speed
		if (animationInterval) clearInterval(animationInterval);
		animationInterval = setInterval(() => {
			viewerDirection = (viewerDirection + 1) % animationOrder.length;
		}, animationSpeed);
	}
}

// Cleanup on unmount
$effect(() => {
	return () => {
		if (animationInterval) clearInterval(animationInterval);
	};
});

// Get current viewer image
const currentViewerImage = $derived(
	displayRotations[
		animationOrder[viewerDirection] as keyof typeof displayRotations
	],
);
const currentViewerLabel = $derived(
	animationOrder[viewerDirection].toUpperCase(),
);

// Export spritesheet
async function exportSpritesheet() {
	if (!hasAnyRotation) return;

	const images: HTMLImageElement[] = [];
	const loadPromises: Promise<void>[] = [];

	// Load all images
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

		// Get dimensions from first image
		const imgWidth = images[0].width;
		const imgHeight = images[0].height;

		// Create canvas for horizontal spritesheet (8 frames in a row)
		const canvas = document.createElement('canvas');
		canvas.width = imgWidth * images.length;
		canvas.height = imgHeight;

		const ctx = canvas.getContext('2d');
		if (!ctx) return;

		// Draw each image
		images.forEach((img, i) => {
			ctx.drawImage(img, i * imgWidth, 0);
		});

		// Download
		const link = document.createElement('a');
		link.download = 'spritesheet.png';
		link.href = canvas.toDataURL('image/png');
		link.click();
	} catch (e) {
		console.error('Failed to export spritesheet:', e);
		alert('Failed to export spritesheet');
	}
}

function getSpriteUrl(sprite: (typeof sprites)[number]): string | null {
	const urls = sprite.resultUrls as { processed?: string; raw?: string } | null;
	return urls?.processed || urls?.raw || null;
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
			{#if rotationJobs.length > 0}
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
				{#each rotationJobs as job (job.id)}
					<button
						onclick={() => selectJob(job.id)}
						class="flex-shrink-0 relative w-16 h-16 rounded-lg overflow-hidden border-2 {viewMode === job.id ? 'border-yellow-500' : 'border-zinc-700 hover:border-zinc-600'} transition-colors"
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
								<Loader2 class="w-5 h-5 animate-spin text-yellow-400" />
								{#if job.progress > 0}
									<span class="text-[9px] text-yellow-400 mt-0.5">{job.progress}%</span>
								{/if}
							</div>
						{/if}
						{#if viewMode === job.id}
							<div class="absolute top-1 right-1 w-3 h-3 bg-yellow-500 rounded-full flex items-center justify-center">
								<Check class="w-2 h-2 text-zinc-900" />
							</div>
						{/if}
					</button>
				{/each}
			</div>

			<!-- Scroll Right -->
			{#if rotationJobs.length > 0}
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
		<!-- Left Panel -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			{#if viewMode === 'new'}
				<!-- New Generation Mode -->
				<h2 class="text-lg font-semibold text-white mb-4">New Rotation</h2>

				{#if previewUrl}
					<div class="relative aspect-square bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden mb-4">
						<img
							src={previewUrl}
							alt="Selected sprite for rotation"
							class="w-full h-full object-contain"
						/>
						<button
							onclick={clearSelection}
							class="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
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
						class="relative aspect-square bg-zinc-800/30 border-2 border-dashed border-zinc-700 hover:border-zinc-600 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors mb-4"
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
							class="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-zinc-300 transition-colors"
						>
							<ImagePlus class="w-4 h-4" />
							Select from your sprites
						</button>

						{#if showSpriteSelector}
							<div class="absolute left-0 right-0 mt-2 p-3 bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl z-10 max-h-48 overflow-y-auto">
								<div class="grid grid-cols-5 gap-2">
									{#each sprites as sprite (sprite.id)}
										{@const url = getSpriteUrl(sprite)}
										{#if url}
											<button
												onclick={() => selectSprite(url)}
												class="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 hover:border-yellow-500/50 transition-colors"
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
						<span class="text-sm text-zinc-300 font-medium">{elevation}°</span>
					</div>
					<input
						type="range"
						id="elevation"
						bind:value={elevation}
						min="-90"
						max="90"
						step="5"
						class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
					/>
					<div class="flex justify-between text-xs text-zinc-500 mt-1">
						<span>-90° (below)</span>
						<span>0° (level)</span>
						<span>90° (above)</span>
					</div>
				</div>

				<button
					onclick={generate}
					disabled={!hasImageSelected || generating || tokens + bonusTokens < TOKEN_COST}
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

				<p class="text-xs text-zinc-500 mt-3 text-center">
					Upload a front-facing image to generate 8-directional views
				</p>
			{:else if selectedJob}
				<!-- Viewing Existing Job -->
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-white">
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

				{#if selectedJob.status === 'processing' || selectedJob.status === 'pending'}
					<!-- Progress View -->
					<div class="aspect-square bg-zinc-800/30 rounded-lg border border-zinc-700 flex flex-col items-center justify-center mb-4">
						<Loader2 class="w-12 h-12 animate-spin text-yellow-400 mb-4" />
						<p class="text-sm text-zinc-300 mb-2">{selectedJob.currentStage || 'Processing...'}</p>
						<div class="w-48 h-2 bg-zinc-700 rounded-full overflow-hidden">
							<div
								class="h-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all duration-500"
								style="width: {selectedJob.progress}%"
							></div>
						</div>
						<p class="text-xs text-zinc-500 mt-2">{selectedJob.progress}% complete</p>
					</div>
				{:else if selectedJob.status === 'failed'}
					<!-- Error View -->
					<div class="aspect-square bg-red-500/5 rounded-lg border border-red-500/20 flex flex-col items-center justify-center mb-4 p-6">
						<X class="w-12 h-12 text-red-400 mb-4" />
						<p class="text-sm text-red-300 text-center mb-2">Generation failed</p>
						{#if selectedJob.errorMessage}
							<p class="text-xs text-red-400/70 text-center">{selectedJob.errorMessage}</p>
						{/if}
					</div>
					<button
						onclick={startNewGeneration}
						class="w-full py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors flex items-center justify-center gap-2"
					>
						<Plus class="w-4 h-4" />
						Try Again
					</button>
				{:else if selectedJob.status === 'completed'}
					<!-- Input Image Preview (if available) -->
					{#if selectedJob.inputImageUrl}
						<div class="mb-4">
							<span class="text-xs text-zinc-500 mb-2 block">Input Image</span>
							<div class="aspect-square bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden">
								<img
									src={selectedJob.inputImageUrl}
									alt="Input"
									class="w-full h-full object-contain"
								/>
							</div>
						</div>
					{/if}

					<!-- Job Info -->
					<div class="mb-4 p-3 bg-zinc-800/30 rounded-lg border border-zinc-700">
						<div class="flex items-center justify-between text-sm">
							<span class="text-zinc-400">Camera Elevation</span>
							<span class="text-white font-medium">{selectedJob.elevation ?? 20}°</span>
						</div>
						{#if selectedJob.runpodJobId}
							<div class="flex items-center justify-between text-sm mt-2">
								<span class="text-zinc-400">Job ID</span>
								<span class="text-white font-mono text-xs">{selectedJob.runpodJobId}</span>
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

		<!-- Right Panel: 8-Direction Grid -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<div class="flex items-center justify-between mb-4">
				<h2 class="text-lg font-semibold text-white">8-Direction Output</h2>
				{#if hasAnyRotation}
					<div class="flex items-center gap-2">
						<button
							onclick={openViewer}
							class="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-xs font-medium rounded-lg transition-colors"
							title="Open viewer"
						>
							<Expand class="w-3.5 h-3.5" />
							View
						</button>
						<button
							onclick={exportSpritesheet}
							class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
							title="Export as spritesheet"
						>
							<Grid3x3 class="w-3.5 h-3.5" />
							Spritesheet
						</button>
						<button
							onclick={downloadAll}
							class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
						>
							<Download class="w-3.5 h-3.5" />
							Download
						</button>
					</div>
				{/if}
			</div>

			<!-- 3x3 Grid -->
			<div class="grid grid-cols-3 gap-2">
				{#each directions as dir}
					{#if dir.key === 'center'}
						<div class="aspect-square bg-zinc-800/50 rounded-lg border border-zinc-600 flex items-center justify-center overflow-hidden">
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
							class="group relative aspect-square bg-zinc-800/50 rounded-lg border border-zinc-700 flex flex-col items-center justify-center overflow-hidden {url ? 'cursor-pointer hover:border-yellow-500/50' : 'cursor-default'} transition-colors"
						>
							{#if url}
								<img
									src={url}
									alt={dir.label}
									class="w-full h-full object-contain"
								/>
								<div
									class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2"
								>
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

			<!-- Legend -->
			<div class="mt-4 pt-4 border-t border-zinc-800">
				<p class="text-xs text-zinc-500 text-center">
					N = Front • S = Back • E = Right • W = Left
				</p>
			</div>

			<!-- Tips (only show when creating new) -->
			{#if viewMode === 'new'}
				<div class="mt-4 pt-4 border-t border-zinc-800">
					<p class="text-xs text-zinc-400 mb-2">Tips for best results:</p>
					<ul class="text-xs text-zinc-500 space-y-1">
						<li>• Use front-facing images with clear subjects</li>
						<li>• White or transparent backgrounds work best</li>
						<li>• Higher resolution inputs = better results</li>
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
		class="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4"
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
			<!-- Close button -->
			<button
				onclick={closeViewer}
				class="absolute -top-2 -right-2 z-10 p-2 bg-zinc-800 hover:bg-zinc-700 rounded-full text-zinc-400 hover:text-white transition-colors"
			>
				<X class="w-5 h-5" />
			</button>

			<!-- Main viewer -->
			<div class="bg-zinc-900 border border-zinc-700 rounded-xl overflow-hidden flex flex-col max-h-[calc(100vh-2rem)]">
				<!-- Image display -->
				<div class="relative flex-1 min-h-0 bg-zinc-800/50 flex items-center justify-center p-8">
					{#if currentViewerImage}
						<img
							src={currentViewerImage}
							alt={currentViewerLabel}
							class="max-w-full max-h-[50vh] object-contain"
						/>
					{:else}
						<div class="text-zinc-500">No image</div>
					{/if}

					<!-- Direction indicator -->
					<div class="absolute top-3 left-3 px-3 py-1.5 bg-black/60 rounded-lg">
						<span class="text-white font-medium">{currentViewerLabel}</span>
					</div>

					<!-- Navigation arrows -->
					<button
						onclick={prevDirection}
						class="absolute left-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
					>
						<ChevronLeft class="w-5 h-5 text-white" />
					</button>
					<button
						onclick={nextDirection}
						class="absolute right-2 top-1/2 -translate-y-1/2 p-2 bg-black/60 hover:bg-black/80 rounded-full transition-colors"
					>
						<ChevronRight class="w-5 h-5 text-white" />
					</button>
				</div>

				<!-- Controls -->
				<div class="p-4 border-t border-zinc-700 bg-zinc-900 space-y-3">
					<!-- Direction thumbnails -->
					<div class="flex items-center justify-center gap-1">
						{#each animationOrder as dir, i}
							{@const url = displayRotations[dir as keyof typeof displayRotations]}
							<button
								onclick={() => { viewerDirection = i; }}
								class="w-10 h-10 rounded border-2 overflow-hidden transition-all {viewerDirection === i ? 'border-yellow-500' : 'border-zinc-700 hover:border-zinc-600'}"
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

					<!-- Animation and export controls -->
					<div class="flex items-center justify-center gap-3 flex-wrap">
						<!-- Animation controls -->
						<button
							onclick={togglePlay}
							class="flex items-center gap-2 px-4 py-2 {isPlaying ? 'bg-yellow-500 text-zinc-900' : 'bg-zinc-800 text-white'} hover:opacity-90 rounded-lg transition-all font-medium"
						>
							{#if isPlaying}
								<Pause class="w-4 h-4" />
								Pause
							{:else}
								<Play class="w-4 h-4" />
								Play
							{/if}
						</button>

						<!-- Speed control -->
						<div class="flex items-center gap-2">
							<span class="text-xs text-zinc-400">Speed:</span>
							<select
								value={animationSpeed}
								onchange={(e) => changeSpeed(Number((e.target as HTMLSelectElement).value))}
								class="px-2 py-1 bg-zinc-800 border border-zinc-700 rounded text-sm text-white focus:outline-none focus:ring-1 focus:ring-yellow-500"
							>
								<option value={400}>Slow</option>
								<option value={200}>Normal</option>
								<option value={100}>Fast</option>
								<option value={50}>Very Fast</option>
							</select>
						</div>

						<div class="w-px h-6 bg-zinc-700"></div>

						<!-- Export buttons -->
						<button
							onclick={exportSpritesheet}
							class="flex items-center gap-1.5 px-3 py-2 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
						>
							<Grid3x3 class="w-4 h-4" />
							Spritesheet
						</button>
						<button
							onclick={downloadAll}
							class="flex items-center gap-1.5 px-3 py-2 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
						>
							<Download class="w-4 h-4" />
							Download
						</button>
					</div>

					<!-- Keyboard hints -->
					<div class="text-center text-xs text-zinc-500 pt-2 border-t border-zinc-800">
						<span class="inline-flex items-center gap-4 flex-wrap justify-center">
							<span><kbd class="px-1.5 py-0.5 bg-zinc-800 rounded">←</kbd> <kbd class="px-1.5 py-0.5 bg-zinc-800 rounded">→</kbd> Navigate</span>
							<span><kbd class="px-1.5 py-0.5 bg-zinc-800 rounded">Space</kbd> Play/Pause</span>
							<span><kbd class="px-1.5 py-0.5 bg-zinc-800 rounded">Esc</kbd> Close</span>
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}
