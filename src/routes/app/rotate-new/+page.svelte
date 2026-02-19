<script lang="ts">
import {
	ArrowDown,
	ArrowLeft,
	ArrowRight,
	ArrowUp,
	Check,
	ChevronLeft,
	ChevronRight,
	Download,
	Expand,
	FlaskConical,
	Grid3x3,
	ImagePlus,
	Loader2,
	Pause,
	Play,
	Plus,
	RefreshCw,
	RotateCw,
	Sparkles,
	Upload,
	X,
	Zap,
} from 'lucide-svelte';
import JSZip from 'jszip';
import { GUEST_CONFIG } from '$lib/guest-config';
import { PRICING } from '$lib/pricing';
import { tokenState } from '$lib/token-state.svelte';
import type { RotationJobNew } from '$lib/server/db/schema';
import type { LayoutData } from '../$types';
import type { PageData } from './$types';

let { data }: { data: PageData & LayoutData } = $props();

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
let rotationJobs = $state<RotationJobNew[]>(initialJobs);

// Track polling
const pollingSet = new Set<string>();

const TOKEN_COST = PRICING.tokenCosts.rotationNew;
const SINGLE_VIEW_TOKEN_COST = PRICING.tokenCosts.rotationSingleView;

const guestGenerationsRemaining = $derived(
	GUEST_CONFIG.maxGenerations - tokenState.guestGenerationsUsed
);

const canGenerate = $derived(
	data.isGuest
		? guestGenerationsRemaining > 0
		: tokenState.total >= TOKEN_COST
);

// Regeneration state
type Direction = 'front' | 'right' | 'back' | 'left';
type SourceDirection = Direction | 'input';
let showRegenerateModal = $state(false);
let regenerateTargetDirection = $state<Direction | null>(null);
let regenerateSourceDirection = $state<SourceDirection>('input');
let regenerating = $state(false);
let regeneratingDirection = $state<Direction | null>(null);

const directionAngles: Record<SourceDirection, number> = {
	input: 0,
	front: 0,
	right: 90,
	back: 180,
	left: 270,
};

function calculateAngle(source: SourceDirection, target: Direction): number {
	let angle = directionAngles[target] - directionAngles[source];
	if (angle < 0) angle += 360;
	return angle;
}

function openRegenerateModal(direction: Direction) {
	if (regenerating) return; // Prevent opening while regenerating
	regenerateTargetDirection = direction;
	regenerateSourceDirection = 'input'; // Default to original input
	showRegenerateModal = true;
}

function closeRegenerateModal() {
	showRegenerateModal = false;
	regenerateTargetDirection = null;
}

async function regenerateView() {
	if (!selectedJob || !regenerateTargetDirection || regenerating) return;

	// Capture values before async operations
	const targetDir = regenerateTargetDirection;
	const sourceDir = regenerateSourceDirection;
	const jobId = selectedJob.id;

	if (tokenState.total < SINGLE_VIEW_TOKEN_COST) {
		alert('Not enough tokens');
		return;
	}

	regenerating = true;
	regeneratingDirection = targetDir;
	closeRegenerateModal();

	try {
		const res = await fetch(`/api/rotate-new/${jobId}/regenerate`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				targetDirection: targetDir,
				sourceDirection: sourceDir,
			}),
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to regenerate');
			regenerating = false;
			return;
		}

		const result = await res.json();
		tokenState.tokens = result.tokensRemaining ?? tokenState.tokens;
		tokenState.bonusTokens = result.bonusTokensRemaining ?? tokenState.bonusTokens;

		// Update the job with the new image
		const columnName = `rotation${targetDir.charAt(0).toUpperCase() + targetDir.slice(1)}` as keyof RotationJobNew;
		rotationJobs = rotationJobs.map((j) =>
			j.id === jobId
				? { ...j, [columnName]: result.url }
				: j,
		);
	} catch (e) {
		console.error('Regeneration error:', e);
		alert('Failed to regenerate view');
	} finally {
		regenerating = false;
		regeneratingDirection = null;
	}
}

// Get available source images for regeneration
const availableSources = $derived(() => {
	if (!selectedJob) return [];
	const sources: { key: SourceDirection; label: string; url: string | null }[] = [
		{ key: 'input', label: 'Original Input', url: selectedJob.inputImageUrl },
		{ key: 'front', label: 'Front View', url: selectedJob.rotationFront },
		{ key: 'right', label: 'Right View', url: selectedJob.rotationRight },
		{ key: 'back', label: 'Back View', url: selectedJob.rotationBack },
		{ key: 'left', label: 'Left View', url: selectedJob.rotationLeft },
	];
	return sources.filter((s) => s.url);
});

// Viewer state
let showViewer = $state(false);
let viewerDirection = $state(0); // Index into animationOrder
let isPlaying = $state(false);
let animationSpeed = $state(200); // ms per frame
let animationInterval: ReturnType<typeof setInterval> | null = null; // Not reactive

// Animation order for cycling through directions (clockwise starting from Front)
const animationOrder = ['front', 'right', 'back', 'left'] as const;

const directions = [
	{ key: 'front', label: 'Front', icon: ArrowUp },
	{ key: 'right', label: 'Right', icon: ArrowRight },
	{ key: 'back', label: 'Back', icon: ArrowDown },
	{ key: 'left', label: 'Left', icon: ArrowLeft },
] as const;

// Derived: currently selected job (if viewing existing)
const selectedJob = $derived(
	viewMode !== 'new' ? rotationJobs.find((j) => j.id === viewMode) : null,
);

// Derived: rotations to display
const displayRotations = $derived(
	selectedJob
		? {
				front: selectedJob.rotationFront,
				right: selectedJob.rotationRight,
				back: selectedJob.rotationBack,
				left: selectedJob.rotationLeft,
			}
		: {
				front: null,
				right: null,
				back: null,
				left: null,
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
	if (!hasImageSelected || generating || !canGenerate) return;

	generating = true;

	try {
		const formData = new FormData();

		if (uploadedFile) {
			formData.append('image', uploadedFile);
		} else if (selectedImageUrl) {
			formData.append('imageUrl', selectedImageUrl);
		}
		formData.append('elevation', elevation.toString());

		const res = await fetch('/api/rotate-new/generate', {
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

		if (result.isGuest) {
			tokenState.guestGenerationsUsed = GUEST_CONFIG.maxGenerations - result.generationsRemaining;
		} else {
			tokenState.tokens = result.tokensRemaining ?? tokenState.tokens;
			tokenState.bonusTokens = result.bonusTokensRemaining ?? tokenState.bonusTokens;
		}

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
			const res = await fetch(`/api/rotate-new/${id}/status`);
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
							falRequestId: result.falRequestId || j.falRequestId,
							rotationFront: result.rotations?.front,
							rotationRight: result.rotations?.right,
							rotationBack: result.rotations?.back,
							rotationLeft: result.rotations?.left,
						}
					: j,
			);

			if (result.status === 'completed' || result.status === 'failed') {
				pollingSet.delete(id);
				if (currentGeneratingId === id) {
					generating = false;
					currentGeneratingId = null;
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
		a.download = 'rotation_4dir.zip';
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

function getJobPreviewImage(job: RotationJobNew): string | null {
	return (
		job.rotationFront || job.rotationBack || job.rotationRight || job.rotationLeft || null
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
	animationOrder[viewerDirection].charAt(0).toUpperCase() + animationOrder[viewerDirection].slice(1),
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

		// Create canvas for horizontal spritesheet (4 frames in a row)
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

async function cancelJob(id: string) {
	if (!confirm('Cancel this generation? Tokens will be refunded.')) return;

	try {
		const res = await fetch(`/api/rotate-new/${id}/cancel`, { method: 'POST' });
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
			tokenState.tokens = tokenState.tokens + (result.regularTokensRefunded ?? 0);
			tokenState.bonusTokens = tokenState.bonusTokens + (result.bonusTokensRefunded ?? 0);
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

<div class="rotate-new-page">
	<!-- Beta Banner -->
	<div class="beta-banner">
		<div class="beta-icon">
			<FlaskConical class="w-5 h-5" />
		</div>
		<div class="beta-content">
			<div class="beta-header">
				<h3 class="beta-title">New 4-Direction Rotation</h3>
				<span class="beta-tag">Beta</span>
			</div>
			<p class="beta-desc">
				<Zap class="w-3 h-3 inline text-amber-400 -mt-0.5" />
				Powered by a new AI pipeline with improved quality and faster generation.
				This feature is in beta and may occasionally produce unexpected results.
			</p>
		</div>
	</div>

	<!-- History Bar -->
	<div class="history-bar">
		<div class="flex items-center gap-2">
			<button onclick={startNewGeneration} class="history-new {viewMode === 'new' ? 'history-new-active' : ''}">
				<Plus class="w-6 h-6 {viewMode === 'new' ? 'text-amber-400' : 'text-zinc-500'}" />
			</button>

			{#if rotationJobs.length > 0}
				<button onclick={() => scrollHistory('left')} class="history-scroll-btn">
					<ChevronLeft class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}

			<div
				bind:this={historyScrollContainer}
				class="flex-1 flex gap-2 overflow-x-auto"
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
									class="w-full h-full object-contain"
								/>
							{:else}
								<div class="w-full h-full flex items-center justify-center">
									<Check class="w-5 h-5 text-green-400" />
								</div>
							{/if}
						{:else if job.status === 'failed'}
							<div class="w-full h-full flex items-center justify-center">
								<X class="w-5 h-5 text-red-400" />
							</div>
						{:else}
							<div class="w-full h-full flex flex-col items-center justify-center">
								<Loader2 class="w-5 h-5 animate-spin text-amber-400" />
							</div>
						{/if}
						{#if viewMode === job.id}
							<div class="history-dot">
								<Check class="w-2 h-2 text-zinc-900" />
							</div>
						{/if}
					</button>
				{/each}
			</div>

			{#if rotationJobs.length > 0}
				<button onclick={() => scrollHistory('right')} class="history-scroll-btn">
					<ChevronRight class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="main-grid">
		<!-- Left Panel -->
		<div class="panel">
			{#if viewMode === 'new'}
				<!-- New Generation Mode -->
				<h2 class="panel-title">New 4-Direction Rotation</h2>

				{#if previewUrl}
					<div class="preview-container">
						<img
							src={previewUrl}
							alt="Selected sprite for rotation"
							class="w-full h-full object-contain"
						/>
						<button onclick={clearSelection} class="preview-clear">
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
						class="drop-zone"
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
							class="sprite-select-btn"
						>
							<ImagePlus class="w-4 h-4" />
							Select from your sprites
						</button>

						{#if showSpriteSelector}
							<div class="sprite-dropdown">
								<div class="grid grid-cols-5 gap-2">
									{#each sprites as sprite (sprite.id)}
										{@const url = getSpriteUrl(sprite)}
										{#if url}
											<button
												onclick={() => selectSprite(url)}
												class="sprite-dropdown-item"
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
						<label for="elevation" class="field-label">Camera Elevation</label>
						<span class="text-sm text-zinc-300 font-medium">{elevation}°</span>
					</div>
					<input
						type="range"
						id="elevation"
						bind:value={elevation}
						min="-90"
						max="90"
						step="5"
						class="range-slider"
					/>
					<div class="flex justify-between text-xs text-zinc-500 mt-1">
						<span>-90° (below)</span>
						<span>0° (level)</span>
						<span>90° (above)</span>
					</div>
				</div>

				<button
					onclick={generate}
					disabled={!hasImageSelected || generating || !canGenerate}
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

				{#if data.isGuest && !canGenerate}
				<a href="/login" class="btn-generate" style="text-decoration:none; text-align:center; margin-top:0.5rem">
					<Sparkles class="w-4 h-4" />
					Sign up to continue
				</a>
				<p class="text-xs text-zinc-500 mt-2 text-center">
					Get 50 free tokens when you sign up
				</p>
				{/if}

				<p class="text-xs text-zinc-500 mt-3 text-center">
					Upload a front-facing image to generate 4-directional views (Front, Right, Back, Left)
				</p>
			{:else if selectedJob}
				<!-- Viewing Existing Job -->
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

				{#if selectedJob.falRequestId}
					<div class="mb-3 text-xs text-zinc-500 font-mono">
						Job: {selectedJob.falRequestId}
					</div>
				{/if}

				{#if selectedJob.status === 'processing' || selectedJob.status === 'pending'}
					<!-- Progress View -->
					<div class="progress-box">
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
					<!-- Error View -->
					<div class="error-box">
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
					<!-- Input Image Preview (if available) -->
					{#if selectedJob.inputImageUrl}
						<div class="mb-4">
							<span class="field-label mb-2 block">Input Image</span>
							<div class="input-preview">
								<img
									src={selectedJob.inputImageUrl}
									alt="Input"
									class="w-full h-full object-contain"
								/>
							</div>
						</div>
					{/if}

					<!-- Job Info -->
					<div class="info-strip">
						<span class="text-zinc-400">Camera Elevation</span>
						<span class="text-white font-medium">{selectedJob.elevation ?? 20}°</span>
					</div>

					<!-- Actions -->
					<button onclick={startNewGeneration} class="btn-secondary w-full mt-4">
						<Plus class="w-4 h-4" />
						New Rotation
					</button>
				{/if}
			{/if}
		</div>

		<!-- Right Panel: 4-Direction Grid (2x2) -->
		<div class="panel">
			<div class="flex items-center justify-between mb-4">
				<h2 class="panel-title" style="margin-bottom:0">4-Direction Output</h2>
				{#if hasAnyRotation}
					<div class="flex items-center gap-2">
						<button onclick={openViewer} class="btn-sm-gold" title="Open viewer">
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

			<!-- 2x2 Grid -->
			<div class="dir-grid">
				{#each directions as dir}
					{@const url = displayRotations[dir.key as keyof typeof displayRotations]}
					{@const isRegenerating = regeneratingDirection === dir.key}
					<div class="dir-cell {url && !isRegenerating ? 'dir-cell-filled' : ''} {isRegenerating ? 'dir-cell-regen' : ''}">
						{#if isRegenerating}
							<!-- Regenerating overlay -->
							<div class="regen-overlay">
								<Loader2 class="w-8 h-8 animate-spin text-amber-400 mb-2" />
								<span class="text-xs text-amber-400 font-medium">Regenerating...</span>
							</div>
							{#if url}
								<img
									src={url}
									alt={dir.label}
									class="w-full h-full object-contain opacity-30"
								/>
							{/if}
						{:else if url}
							<img
								src={url}
								alt={dir.label}
								class="w-full h-full object-contain"
							/>
							<!-- Hover overlay with actions -->
							<div class="dir-cell-overlay">
								<button
									onclick={() => {
										const idx = animationOrder.indexOf(dir.key as typeof animationOrder[number]);
										if (idx !== -1) {
											viewerDirection = idx;
											showViewer = true;
										}
									}}
									class="dir-action"
									title="View"
								>
									<Expand class="w-5 h-5 text-white" />
								</button>
								<button
									onclick={() => openRegenerateModal(dir.key as Direction)}
									disabled={regenerating}
									class="dir-action-gold"
									title={regenerating ? 'Regeneration in progress' : 'Regenerate this view'}
								>
									<RefreshCw class="w-5 h-5 text-zinc-900" />
								</button>
							</div>
							<!-- Direction label overlay -->
							<div class="dir-label">{dir.label}</div>
						{:else if selectedJob?.status === 'processing'}
							<Loader2 class="w-6 h-6 animate-spin text-zinc-600" />
							<span class="text-xs text-zinc-500 mt-2">{dir.label}</span>
						{:else}
							{@const Icon = dir.icon}
							<Icon class="w-8 h-8 text-zinc-600 mb-2" />
							<span class="text-sm text-zinc-500">{dir.label}</span>
						{/if}
					</div>
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

			<!-- Legend -->
			<div class="legend">
				<p class="text-xs text-zinc-500 text-center">
					Front = Face &bull; Right = Side &bull; Back = Rear &bull; Left = Side
				</p>
			</div>

			<!-- Tips (only show when creating new) -->
			{#if viewMode === 'new'}
				<div class="tips">
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
		<div class="viewer-shell">
			<!-- Close button -->
			<button onclick={closeViewer} class="viewer-close">
				<X class="w-5 h-5" />
			</button>

			<!-- Main viewer -->
			<div class="viewer-inner">
				<!-- Image display -->
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

					<!-- Direction indicator -->
					<div class="viewer-dir-badge">
						<span class="text-white font-medium">{currentViewerLabel}</span>
					</div>

					<!-- Navigation arrows -->
					<button onclick={prevDirection} class="viewer-nav viewer-nav-left">
						<ChevronLeft class="w-5 h-5 text-white" />
					</button>
					<button onclick={nextDirection} class="viewer-nav viewer-nav-right">
						<ChevronRight class="w-5 h-5 text-white" />
					</button>
				</div>

				<!-- Controls -->
				<div class="viewer-controls">
					<!-- Direction thumbnails -->
					<div class="flex items-center justify-center gap-2">
						{#each animationOrder as dir, i}
							{@const url = displayRotations[dir as keyof typeof displayRotations]}
							<button
								onclick={() => { viewerDirection = i; }}
								class="viewer-thumb {viewerDirection === i ? 'viewer-thumb-active' : ''}"
							>
								{#if url}
									<img src={url} alt={dir} class="w-full h-full object-contain" />
								{:else}
									<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-500">
										{dir.charAt(0).toUpperCase() + dir.slice(1)}
									</div>
								{/if}
							</button>
						{/each}
					</div>

					<!-- Animation and export controls -->
					<div class="flex items-center justify-center gap-3 flex-wrap">
						<button
							onclick={togglePlay}
							class="viewer-play {isPlaying ? 'viewer-play-active' : ''}"
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
								class="viewer-speed"
							>
								<option value={400}>Slow</option>
								<option value={200}>Normal</option>
								<option value={100}>Fast</option>
								<option value={50}>Very Fast</option>
							</select>
						</div>

						<div class="w-px h-6 bg-zinc-700"></div>

						<!-- Export buttons -->
						<button onclick={exportSpritesheet} class="btn-sm">
							<Grid3x3 class="w-4 h-4" />
							Spritesheet
						</button>
						<button onclick={downloadAll} class="btn-sm-gold">
							<Download class="w-4 h-4" />
							Download
						</button>
					</div>

					<!-- Keyboard hints -->
					<div class="text-center text-xs text-zinc-500 pt-3 border-t border-zinc-800/60">
						<span class="inline-flex items-center gap-4 flex-wrap justify-center">
							<span><kbd class="kbd">←</kbd> <kbd class="kbd">→</kbd> Navigate</span>
							<span><kbd class="kbd">Space</kbd> Play/Pause</span>
							<span><kbd class="kbd">Esc</kbd> Close</span>
						</span>
					</div>
				</div>
			</div>
		</div>
	</div>
{/if}

<!-- Regenerate Modal -->
{#if showRegenerateModal && regenerateTargetDirection}
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="modal-backdrop"
		onclick={(e) => e.target === e.currentTarget && closeRegenerateModal()}
		onkeydown={(e) => e.key === 'Escape' && closeRegenerateModal()}
		role="dialog"
		tabindex="-1"
	>
		<div class="regen-modal">
			<!-- Header -->
			<div class="regen-modal-header">
				<h3 class="text-lg font-semibold text-white">
					Regenerate {regenerateTargetDirection.charAt(0).toUpperCase() + regenerateTargetDirection.slice(1)} View
				</h3>
				<button onclick={closeRegenerateModal} class="regen-modal-close">
					<X class="w-5 h-5 text-zinc-400" />
				</button>
			</div>

			<!-- Content -->
			<div class="regen-modal-body">
				<div>
					<label class="field-label mb-2 block">Source Image</label>
					<p class="text-xs text-zinc-500 mb-3">
						Choose which image to rotate from. The angle will be calculated automatically.
					</p>
					<div class="grid grid-cols-2 gap-2">
						{#each availableSources() as source}
							<button
								onclick={() => regenerateSourceDirection = source.key}
								class="source-card {regenerateSourceDirection === source.key ? 'source-card-active' : ''}"
							>
								{#if source.url}
									<img src={source.url} alt={source.label} class="w-full h-full object-contain" />
								{/if}
								<div class="source-card-label">{source.label}</div>
								{#if regenerateSourceDirection === source.key}
									<div class="source-card-check">
										<Check class="w-3 h-3 text-zinc-900" />
									</div>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<!-- Angle Preview -->
				<div class="info-strip">
					<span class="text-zinc-400">Rotation Angle</span>
					<span class="text-white font-medium">
						{calculateAngle(regenerateSourceDirection, regenerateTargetDirection)}°
					</span>
				</div>
				<p class="text-xs text-zinc-500 -mt-2">
					From {regenerateSourceDirection} ({directionAngles[regenerateSourceDirection]}°) to {regenerateTargetDirection} ({directionAngles[regenerateTargetDirection]}°)
				</p>

				<!-- Cost -->
				<div class="cost-strip">
					<span class="text-sm text-zinc-300">Cost</span>
					<span class="text-sm font-semibold text-amber-400">{SINGLE_VIEW_TOKEN_COST} tokens</span>
				</div>
			</div>

			<!-- Footer -->
			<div class="regen-modal-footer">
				<button onclick={closeRegenerateModal} class="btn-secondary flex-1">
					Cancel
				</button>
				<button
					onclick={regenerateView}
					disabled={regenerating || tokenState.total < SINGLE_VIEW_TOKEN_COST}
					class="btn-generate flex-1"
					style="padding-top:.65rem;padding-bottom:.65rem"
				>
					{#if regenerating}
						<Loader2 class="w-4 h-4 animate-spin" />
						Regenerating...
					{:else}
						<RefreshCw class="w-4 h-4" />
						Regenerate
					{/if}
				</button>
			</div>
		</div>
	</div>
{/if}

<style>
	.rotate-new-page {
		display: flex; flex-direction: column; gap: 1rem;
	}

	/* Beta Banner */
	.beta-banner {
		display: flex; align-items: flex-start; gap: .75rem;
		padding: 1rem 1.25rem;
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(168,85,247,.2);
		border-radius: 1rem;
		backdrop-filter: blur(6px);
	}
	.beta-icon {
		flex-shrink: 0; padding: .5rem;
		background: rgba(168,85,247,.12);
		border-radius: .6rem;
		color: #c084fc;
	}
	.beta-content { flex: 1; min-width: 0; }
	.beta-header { display: flex; align-items: center; gap: .5rem; margin-bottom: .25rem; }
	.beta-title { font-size: .875rem; font-weight: 600; color: #fff; }
	.beta-tag {
		padding: .1rem .45rem;
		font-size: .6rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
		background: rgba(168,85,247,.2);
		color: #d8b4fe;
		border-radius: .25rem;
	}
	.beta-desc { font-size: .75rem; color: #71717a; line-height: 1.5; }

	/* History Bar */
	.history-bar {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		padding: .65rem;
		backdrop-filter: blur(6px);
	}
	.history-new {
		flex-shrink: 0; width: 4rem; height: 4rem;
		border-radius: .6rem;
		border: 2px dashed rgba(63,63,70,.6);
		display: flex; align-items: center; justify-content: center;
		background: none; cursor: pointer;
		transition: border-color .2s, background .2s;
	}
	.history-new:hover { border-color: rgba(63,63,70,.9); }
	.history-new-active {
		border-color: rgba(245,158,11,.5);
		background: rgba(245,158,11,.06);
	}
	.history-scroll-btn {
		flex-shrink: 0; padding: .35rem;
		background: none; border: none; cursor: pointer;
		border-radius: .5rem;
		transition: background .2s;
	}
	.history-scroll-btn:hover { background: rgba(63,63,70,.3); }
	.history-thumb {
		flex-shrink: 0; position: relative;
		width: 4rem; height: 4rem;
		border-radius: .6rem; overflow: hidden;
		border: 2px solid rgba(63,63,70,.4);
		background: rgba(39,39,42,.4);
		cursor: pointer;
		transition: border-color .2s;
	}
	.history-thumb:hover { border-color: rgba(63,63,70,.7); }
	.history-thumb-active { border-color: rgba(245,158,11,.5); }
	.history-dot {
		position: absolute; top: .2rem; right: .2rem;
		width: .75rem; height: .75rem;
		background: #f59e0b; border-radius: 9999px;
		display: flex; align-items: center; justify-content: center;
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
		font-weight: 700; font-size: 1.05rem; color: #fff;
		margin-bottom: 1rem;
	}

	/* Main grid layout */
	.main-grid {
		flex: 1;
		display: grid;
		grid-template-columns: 1fr;
		gap: 1.5rem;
	}
	@media (min-width: 1024px) {
		.main-grid { grid-template-columns: 1fr 1fr; }
	}

	/* Drop zone */
	.drop-zone {
		position: relative; aspect-ratio: 1;
		background: rgba(39,39,42,.25);
		border: 2px dashed rgba(63,63,70,.5);
		border-radius: .85rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		cursor: pointer;
		transition: border-color .2s, background .2s;
		margin-bottom: 1rem;
	}
	.drop-zone:hover {
		border-color: rgba(63,63,70,.8);
		background: rgba(39,39,42,.4);
	}

	/* Preview container */
	.preview-container {
		position: relative; aspect-ratio: 1;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .85rem;
		overflow: hidden;
		margin-bottom: 1rem;
	}
	.preview-clear {
		position: absolute; top: .5rem; right: .5rem;
		padding: .4rem;
		background: rgba(0,0,0,.5);
		border-radius: .5rem; border: none; cursor: pointer;
		transition: background .2s;
	}
	.preview-clear:hover { background: rgba(0,0,0,.7); }

	/* Sprite selector */
	.sprite-select-btn {
		width: 100%;
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		padding: .6rem 1rem;
		background: rgba(63,63,70,.2);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .65rem;
		font-size: .8125rem; color: #a1a1aa;
		cursor: pointer;
		transition: background .2s, border-color .2s;
	}
	.sprite-select-btn:hover {
		background: rgba(63,63,70,.35);
		border-color: rgba(63,63,70,.5);
	}
	.sprite-dropdown {
		position: absolute; left: 0; right: 0;
		margin-top: .5rem; padding: .75rem;
		background: rgba(24,24,27,.95);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .75rem;
		box-shadow: 0 8px 30px rgba(0,0,0,.4);
		z-index: 10;
		max-height: 12rem; overflow-y: auto;
		backdrop-filter: blur(12px);
	}
	.sprite-dropdown-item {
		aspect-ratio: 1;
		background: rgba(39,39,42,.4);
		border-radius: .5rem;
		overflow: hidden;
		border: 1px solid rgba(63,63,70,.35);
		cursor: pointer;
		transition: border-color .2s;
	}
	.sprite-dropdown-item:hover { border-color: rgba(245,158,11,.4); }

	/* Form */
	.field-label { font-size: .8125rem; font-weight: 500; color: #a1a1aa; }
	.range-slider {
		width: 100%; height: .5rem;
		background: rgba(63,63,70,.4);
		border-radius: 9999px;
		appearance: none; cursor: pointer;
		accent-color: #f59e0b;
	}

	/* Buttons */
	.btn-generate {
		width: 100%; padding: .75rem 1.25rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-weight: 600; font-size: .875rem;
		border: none; border-radius: .75rem; cursor: pointer;
		box-shadow: 0 0 20px rgba(245,158,11,.15);
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		transition: box-shadow .2s, transform .15s;
	}
	.btn-generate:hover:not(:disabled) {
		box-shadow: 0 0 30px rgba(245,158,11,.25);
		transform: translateY(-1px);
	}
	.btn-generate:disabled {
		background: rgba(63,63,70,.4);
		color: #52525b;
		box-shadow: none; cursor: not-allowed;
		transform: none;
	}
	.btn-secondary {
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		padding: .6rem 1rem;
		background: rgba(63,63,70,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .65rem;
		color: #fff; font-size: .875rem; font-weight: 500;
		cursor: pointer;
		transition: background .2s, border-color .2s;
	}
	.btn-secondary:hover {
		background: rgba(63,63,70,.5);
		border-color: rgba(63,63,70,.6);
	}
	.btn-cancel {
		width: 100%;
		display: flex; align-items: center; justify-content: center; gap: .5rem;
		padding: .6rem 1rem;
		background: rgba(63,63,70,.25);
		border: 1px solid rgba(239,68,68,.15);
		border-radius: .65rem;
		color: #f87171; font-size: .875rem; font-weight: 500;
		cursor: pointer;
		transition: background .2s, border-color .2s;
	}
	.btn-cancel:hover {
		background: rgba(239,68,68,.08);
		border-color: rgba(239,68,68,.3);
	}
	.btn-sm {
		display: flex; align-items: center; gap: .4rem;
		padding: .4rem .7rem;
		background: rgba(63,63,70,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .5rem;
		color: #fff; font-size: .75rem; font-weight: 500;
		cursor: pointer;
		transition: background .2s, border-color .2s;
	}
	.btn-sm:hover {
		background: rgba(63,63,70,.5);
		border-color: rgba(63,63,70,.6);
	}
	.btn-sm-gold {
		display: flex; align-items: center; gap: .4rem;
		padding: .4rem .7rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		border: none; border-radius: .5rem;
		color: #18181b; font-size: .75rem; font-weight: 600;
		cursor: pointer;
		transition: box-shadow .2s, transform .15s;
	}
	.btn-sm-gold:hover {
		box-shadow: 0 0 12px rgba(245,158,11,.2);
		transform: translateY(-1px);
	}

	/* Progress / Error boxes */
	.progress-box {
		aspect-ratio: 1;
		background: rgba(39,39,42,.2);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .85rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		margin-bottom: 1rem;
	}
	.error-box {
		aspect-ratio: 1;
		background: rgba(239,68,68,.03);
		border: 1px solid rgba(239,68,68,.15);
		border-radius: .85rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		margin-bottom: 1rem;
		padding: 1.5rem;
	}

	/* Input preview */
	.input-preview {
		aspect-ratio: 1;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .85rem;
		overflow: hidden;
	}

	/* Info strip */
	.info-strip {
		display: flex; align-items: center; justify-content: space-between;
		padding: .75rem 1rem;
		background: rgba(39,39,42,.25);
		border: 1px solid rgba(63,63,70,.25);
		border-radius: .65rem;
		font-size: .875rem;
	}

	/* Cost strip */
	.cost-strip {
		display: flex; align-items: center; justify-content: space-between;
		padding: .75rem 1rem;
		background: rgba(245,158,11,.06);
		border: 1px solid rgba(245,158,11,.2);
		border-radius: .65rem;
	}

	/* Direction grid */
	.dir-grid {
		display: grid; grid-template-columns: 1fr 1fr;
		gap: .75rem;
	}
	.dir-cell {
		position: relative; aspect-ratio: 1;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .75rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		overflow: hidden;
		transition: border-color .2s;
	}
	.dir-cell-filled:hover { border-color: rgba(245,158,11,.35); }
	.dir-cell-regen { border-color: rgba(245,158,11,.35); }
	.dir-cell-overlay {
		position: absolute; inset: 0;
		background: rgba(0,0,0,.55);
		display: flex; align-items: center; justify-content: center; gap: .75rem;
		opacity: 0;
		transition: opacity .2s;
	}
	.dir-cell:hover .dir-cell-overlay { opacity: 1; }
	.dir-action {
		padding: .5rem;
		background: rgba(255,255,255,.12);
		border: none; border-radius: .5rem;
		cursor: pointer;
		transition: background .2s;
	}
	.dir-action:hover { background: rgba(255,255,255,.22); }
	.dir-action-gold {
		padding: .5rem;
		background: rgba(245,158,11,.7);
		border: none; border-radius: .5rem;
		cursor: pointer;
		transition: background .2s;
	}
	.dir-action-gold:hover { background: rgba(245,158,11,.9); }
	.dir-action-gold:disabled {
		background: rgba(63,63,70,.4);
		cursor: not-allowed;
	}
	.dir-label {
		position: absolute; bottom: .5rem; left: .5rem;
		padding: .2rem .5rem;
		background: rgba(0,0,0,.55);
		border-radius: .3rem;
		font-size: .7rem; font-weight: 500; color: #fff;
	}
	.regen-overlay {
		position: absolute; inset: 0;
		background: rgba(9,9,11,.75);
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		z-index: 10;
	}

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

	/* Legend / Tips */
	.legend {
		margin-top: 1rem; padding-top: 1rem;
		border-top: 1px solid rgba(63,63,70,.25);
	}
	.tips {
		margin-top: 1rem; padding-top: 1rem;
		border-top: 1px solid rgba(63,63,70,.25);
	}
	.tips li { padding-left: .75rem; position: relative; }
	.tips li::before {
		content: ''; position: absolute;
		left: 0; top: .5em;
		width: .25rem; height: .25rem;
		background: #52525b; border-radius: 50%;
	}

	/* Modal backdrop */
	.modal-backdrop {
		position: fixed; inset: 0; z-index: 50;
		display: flex; align-items: center; justify-content: center;
		background: rgba(0,0,0,.75);
		backdrop-filter: blur(6px);
		padding: 1rem;
	}

	/* Viewer */
	.viewer-shell {
		position: relative; width: 100%; max-width: 48rem;
		max-height: 100%; display: flex; flex-direction: column;
	}
	.viewer-close {
		position: absolute; top: -.5rem; right: -.5rem; z-index: 10;
		padding: .5rem;
		background: rgba(39,39,42,.8);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: 9999px;
		color: #a1a1aa; cursor: pointer;
		transition: color .2s, background .2s;
	}
	.viewer-close:hover { color: #fff; background: rgba(39,39,42,1); }
	.viewer-inner {
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
	.viewer-dir-badge {
		position: absolute; top: .75rem; left: .75rem;
		padding: .35rem .75rem;
		background: rgba(0,0,0,.5);
		border-radius: .5rem;
	}
	.viewer-nav {
		position: absolute; top: 50%; transform: translateY(-50%);
		padding: .5rem;
		background: rgba(0,0,0,.5);
		border: none; border-radius: 9999px;
		cursor: pointer;
		transition: background .2s;
	}
	.viewer-nav:hover { background: rgba(0,0,0,.7); }
	.viewer-nav-left { left: .5rem; }
	.viewer-nav-right { right: .5rem; }

	/* Viewer controls */
	.viewer-controls {
		padding: 1rem 1.25rem;
		border-top: 1px solid rgba(63,63,70,.3);
		background: rgba(24,24,27,.8);
		display: flex; flex-direction: column; gap: .75rem;
	}
	.viewer-thumb {
		width: 3rem; height: 3rem;
		border-radius: .4rem; overflow: hidden;
		border: 2px solid rgba(63,63,70,.4);
		background: rgba(39,39,42,.4);
		cursor: pointer;
		transition: border-color .2s;
	}
	.viewer-thumb:hover { border-color: rgba(63,63,70,.7); }
	.viewer-thumb-active { border-color: rgba(245,158,11,.5); }
	.viewer-play {
		display: flex; align-items: center; gap: .5rem;
		padding: .5rem 1rem;
		background: rgba(63,63,70,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .5rem;
		color: #fff; font-weight: 500; font-size: .875rem;
		cursor: pointer;
		transition: all .2s;
	}
	.viewer-play:hover {
		background: rgba(63,63,70,.5);
	}
	.viewer-play-active {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		border-color: transparent;
		color: #18181b;
	}
	.viewer-play-active:hover {
		background: linear-gradient(135deg, #fcd34d, #fbbf24);
	}
	.viewer-speed {
		padding: .3rem .5rem;
		background: rgba(39,39,42,.4);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .4rem;
		font-size: .8125rem; color: #fff;
		outline: none;
	}
	.viewer-speed:focus {
		border-color: rgba(245,158,11,.4);
	}
	.kbd {
		padding: .15rem .4rem;
		background: rgba(39,39,42,.5);
		border: 1px solid rgba(63,63,70,.3);
		border-radius: .25rem;
		font-size: .7rem;
	}

	/* Regenerate modal */
	.regen-modal {
		background: rgba(24,24,27,.95);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: 1rem;
		width: 100%; max-width: 24rem;
		max-height: 90vh; overflow-y: auto;
		margin: auto;
		backdrop-filter: blur(12px);
	}
	.regen-modal-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: 1rem 1.25rem;
		border-bottom: 1px solid rgba(63,63,70,.3);
	}
	.regen-modal-close {
		padding: .35rem;
		background: none; border: none; cursor: pointer;
		border-radius: .5rem;
		transition: background .2s;
	}
	.regen-modal-close:hover { background: rgba(63,63,70,.3); }
	.regen-modal-body {
		padding: 1.25rem;
		display: flex; flex-direction: column; gap: 1rem;
	}
	.regen-modal-footer {
		display: flex; gap: .75rem;
		padding: 1rem 1.25rem;
		border-top: 1px solid rgba(63,63,70,.3);
		background: rgba(39,39,42,.15);
	}

	/* Source cards */
	.source-card {
		position: relative; aspect-ratio: 1;
		border-radius: .6rem; overflow: hidden;
		border: 2px solid rgba(63,63,70,.4);
		background: rgba(39,39,42,.4);
		cursor: pointer;
		transition: border-color .2s;
	}
	.source-card:hover { border-color: rgba(63,63,70,.7); }
	.source-card-active { border-color: rgba(245,158,11,.5); }
	.source-card-label {
		position: absolute; bottom: 0; left: 0; right: 0;
		padding: .25rem .5rem;
		background: rgba(0,0,0,.6);
		font-size: .7rem; color: #fff; text-align: center;
	}
	.source-card-check {
		position: absolute; top: .25rem; right: .25rem;
		width: 1.25rem; height: 1.25rem;
		background: #f59e0b; border-radius: 9999px;
		display: flex; align-items: center; justify-content: center;
	}
</style>
