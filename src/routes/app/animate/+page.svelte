<script lang="ts">
import JSZip from 'jszip';
import {
	Check,
	ChevronLeft,
	ChevronRight,
	Download,
	Film,
	ImagePlus,
	Loader2,
	Plus,
	RefreshCw,
	Sparkles,
	Upload,
	X,
	Zap,
} from 'lucide-svelte';
import {
	ANIMATION_META,
	ANIMATION_TYPE_LABELS,
	ANIMATION_TYPES,
	type AnimationType,
	DIRECTIONS_4,
	DIRECTIONS_8,
	type Direction,
	ELEVATION_LABELS,
	ELEVATION_PRESETS,
	type ElevationPreset,
} from '$lib/animation-config';
import {
	getAnimationGenerationTokenCost,
	getAnimationReprocessTokenCost,
	PRICING,
} from '$lib/pricing';
import type { AnimationJob } from '$lib/server/db/schema';
import { tokenState } from '$lib/token-state.svelte';
import type { LayoutData } from '../$types';
import type { PageData } from './$types';

let { data }: { data: PageData & LayoutData } = $props();

// svelte-ignore state_referenced_locally
const initialJobs = data.animationJobs;
// svelte-ignore state_referenced_locally
const sprites = data.sprites;
// svelte-ignore state_referenced_locally
const rotations4 = data.rotations4;
// svelte-ignore state_referenced_locally
const rotations8 = data.rotations8;

// View mode
let viewMode = $state<'new' | string>(
	initialJobs.length > 0 ? initialJobs[0].id : 'new',
);

// Per-direction image state
let directionImages = $state<
	Record<string, { file?: File; url?: string; previewUrl?: string }>
>({});
let showSpriteSelector = $state<string | null>(null); // which direction's sprite selector is open

// Animation options
let animationType = $state<AnimationType>('run');
let elevation = $state<ElevationPreset>('iso');
let directionCount = $state<4 | 8>(4);

// Generation state
let generating = $state(false);
let currentGeneratingId = $state<string | null>(null);

// History
let animationJobs = $state<AnimationJob[]>(initialJobs);

// Track polling
const pollingSet = new Set<string>();

const TOKEN_COST = $derived(
	getAnimationGenerationTokenCost(animationType, directionCount),
);

const canGenerate = $derived(tokenState.total >= TOKEN_COST);

const directions = $derived<readonly Direction[]>(
	directionCount === 4 ? DIRECTIONS_4 : DIRECTIONS_8,
);

const filledDirectionCount = $derived(
	directions.filter((d) => directionImages[d]?.file || directionImages[d]?.url)
		.length,
);

const hasAnyImage = $derived(filledDirectionCount > 0);

// Derived: currently selected job
const selectedJob = $derived(
	viewMode !== 'new' ? animationJobs.find((j) => j.id === viewMode) : null,
);

type ArchivePreviewState = {
	sourceUrl: string | null;
	frames: Record<string, string[]>;
	loading: boolean;
	error: string | null;
};

let archivePreview = $state<ArchivePreviewState>({
	sourceUrl: null,
	frames: {},
	loading: false,
	error: null,
});
let archivePreviewRequestId = 0;
let archivePreviewFrameIndex = $state(0);

// Direction display labels
const DIRECTION_LABELS: Record<Direction, string> = {
	south: 'S',
	southwest: 'SW',
	west: 'W',
	northwest: 'NW',
	north: 'N',
	northeast: 'NE',
	east: 'E',
	southeast: 'SE',
};

const DIRECTION_FULL_LABELS: Record<Direction, string> = {
	south: 'South',
	southwest: 'Southwest',
	west: 'West',
	northwest: 'Northwest',
	north: 'North',
	northeast: 'Northeast',
	east: 'East',
	southeast: 'Southeast',
};

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

function revokeArchivePreviewFrames(frames: Record<string, string[]>) {
	for (const directionFrames of Object.values(frames)) {
		for (const url of directionFrames) {
			URL.revokeObjectURL(url);
		}
	}
}

function clearArchivePreview() {
	revokeArchivePreviewFrames(archivePreview.frames);
	archivePreview = {
		sourceUrl: null,
		frames: {},
		loading: false,
		error: null,
	};
}

$effect(() => {
	const job = selectedJob;

	if (!job || job.status !== 'completed' || !job.spritesheetUrl) {
		if (
			archivePreview.sourceUrl ||
			Object.keys(archivePreview.frames).length > 0
		) {
			clearArchivePreview();
		}
		return;
	}

	if (archivePreview.sourceUrl === job.spritesheetUrl) {
		return;
	}

	const requestId = ++archivePreviewRequestId;
	void loadArchivePreview(job, requestId);
});

$effect(() => {
	return () => {
		revokeArchivePreviewFrames(archivePreview.frames);
	};
});

$effect(() => {
	const job = selectedJob;
	const frameGroups = archivePreview.frames;
	if (!job || Object.keys(frameGroups).length === 0) {
		archivePreviewFrameIndex = 0;
		return;
	}

	const frameCount = Math.max(
		1,
		...Object.values(frameGroups).map((frames) => frames.length),
	);
	const meta = ANIMATION_META[job.animationType as AnimationType];
	const intervalMs = meta
		? Math.max(50, Math.round((meta.duration * 1000) / Math.max(1, frameCount)))
		: 80;

	archivePreviewFrameIndex = 0;
	const interval = setInterval(() => {
		archivePreviewFrameIndex = (archivePreviewFrameIndex + 1) % frameCount;
	}, intervalMs);

	return () => clearInterval(interval);
});

// Clean up preview URLs when direction images change
$effect(() => {
	const entries = Object.entries(directionImages);
	const cleanups: (() => void)[] = [];

	for (const [dir, data] of entries) {
		if (data.file && !data.previewUrl) {
			const url = URL.createObjectURL(data.file);
			directionImages[dir] = { ...data, previewUrl: url };
			cleanups.push(() => URL.revokeObjectURL(url));
		}
	}

	return () =>
		cleanups.forEach((fn) => {
			fn();
		});
});

function handleFileSelectForDirection(direction: string, event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) {
		const previewUrl = URL.createObjectURL(file);
		directionImages = {
			...directionImages,
			[direction]: { file, previewUrl },
		};
	}
}

function handleDropForDirection(direction: string, event: DragEvent) {
	event.preventDefault();
	const file = event.dataTransfer?.files[0];
	if (file?.type.startsWith('image/')) {
		const previewUrl = URL.createObjectURL(file);
		directionImages = {
			...directionImages,
			[direction]: { file, previewUrl },
		};
	}
}

function handleDragOver(event: DragEvent) {
	event.preventDefault();
}

function selectSpriteForDirection(direction: string, url: string) {
	directionImages = {
		...directionImages,
		[direction]: { url, previewUrl: url },
	};
	showSpriteSelector = null;
}

function clearDirection(direction: string) {
	const updated = { ...directionImages };
	const existing = updated[direction];
	if (existing?.file && existing?.previewUrl) {
		URL.revokeObjectURL(existing.previewUrl);
	}
	delete updated[direction];
	directionImages = updated;
}

function clearAllDirections() {
	for (const [, data] of Object.entries(directionImages)) {
		if (data.file && data.previewUrl) {
			URL.revokeObjectURL(data.previewUrl);
		}
	}
	directionImages = {};
}

function startNewGeneration() {
	viewMode = 'new';
	clearAllDirections();
}

function selectJob(jobId: string) {
	viewMode = jobId;
}

function getPreviewForDirection(direction: string): string | null {
	return directionImages[direction]?.previewUrl || null;
}

function getSpriteUrl(sprite: (typeof sprites)[number]): string | null {
	const urls = sprite.resultUrls as { processed?: string; raw?: string } | null;
	return urls?.processed || urls?.raw || null;
}

// 4-dir rotation maps front/right/back/left → south/east/north/west
function applyRotation4(rotation: (typeof rotations4)[number]) {
	const mapping: Record<string, string | null> = {
		south: rotation.rotationFront,
		east: rotation.rotationLeft,
		north: rotation.rotationBack,
		west: rotation.rotationRight,
	};

	const updated = { ...directionImages };
	for (const [dir, url] of Object.entries(mapping)) {
		if (url) {
			updated[dir] = { url, previewUrl: url };
		}
	}
	directionImages = updated;
}

// 8-dir rotation maps directly
function applyRotation8(rotation: (typeof rotations8)[number]) {
	const mapping: Record<string, string | null> = {
		north: rotation.rotationN,
		northeast: rotation.rotationNE,
		east: rotation.rotationE,
		southeast: rotation.rotationSE,
		south: rotation.rotationS,
		southwest: rotation.rotationSW,
		west: rotation.rotationW,
		northwest: rotation.rotationNW,
	};

	const updated = { ...directionImages };
	for (const [dir, url] of Object.entries(mapping)) {
		if (url) {
			updated[dir] = { url, previewUrl: url };
		}
	}
	directionImages = updated;
}

function getRotation4PreviewUrl(
	rotation: (typeof rotations4)[number],
): string | null {
	return rotation.rotationFront || rotation.inputImageUrl || null;
}

function getRotation8PreviewUrl(
	rotation: (typeof rotations8)[number],
): string | null {
	return rotation.rotationS || rotation.inputImageUrl || null;
}

function getArchivePreviewFrame(direction: string): string | null {
	const frames = archivePreview.frames[direction];
	if (!frames || frames.length === 0) return null;
	return frames[archivePreviewFrameIndex % frames.length] || null;
}

async function loadArchivePreview(job: AnimationJob, requestId: number) {
	const sourceUrl = job.spritesheetUrl;
	if (!sourceUrl) return;

	revokeArchivePreviewFrames(archivePreview.frames);
	archivePreview = {
		sourceUrl,
		frames: {},
		loading: true,
		error: null,
	};

	try {
		const res = await fetch(sourceUrl);
		if (!res.ok) {
			throw new Error(`Failed to fetch archive (${res.status})`);
		}

		const zip = await JSZip.loadAsync(await res.arrayBuffer());
		const directions = (
			job.directionCount === 4 ? DIRECTIONS_4 : DIRECTIONS_8
		).filter((dir) => {
			const videos = job.directionVideos as Record<string, string> | null;
			return videos?.[dir];
		});

		const frames: Record<string, string[]> = {};

		for (const dir of directions) {
			const entries = zip
				.file(new RegExp(`^${dir}/\\d+\\.png$`))
				.sort((a, b) => a.name.localeCompare(b.name));

			if (entries.length === 0) continue;

			frames[dir] = await Promise.all(
				entries.map(async (entry) => {
					const blob = await entry.async('blob');
					return URL.createObjectURL(blob);
				}),
			);
		}

		if (requestId !== archivePreviewRequestId) {
			revokeArchivePreviewFrames(frames);
			return;
		}

		archivePreview = {
			sourceUrl,
			frames,
			loading: false,
			error:
				Object.keys(frames).length > 0
					? null
					: 'No PNG frames found in archive.',
		};
	} catch (error) {
		if (requestId !== archivePreviewRequestId) return;

		archivePreview = {
			sourceUrl,
			frames: {},
			loading: false,
			error:
				error instanceof Error
					? error.message
					: 'Failed to load archive preview.',
		};
	}
}

let showRotationSelector = $state(false);

async function generate() {
	if (!hasAnyImage || generating || !canGenerate) return;

	generating = true;

	try {
		const formData = new FormData();

		for (const dir of directions) {
			const data = directionImages[dir];
			if (!data) continue;

			if (data.file) {
				formData.append(`image_${dir}`, data.file);
			} else if (data.url) {
				formData.append(`imageUrl_${dir}`, data.url);
			}
		}

		formData.append('animationType', animationType);
		formData.append('elevation', elevation);
		formData.append('directionCount', directionCount.toString());

		const res = await fetch('/api/animate/generate', {
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
		tokenState.bonusTokens =
			result.bonusTokensRemaining ?? tokenState.bonusTokens;

		if (result.job) {
			animationJobs = [result.job, ...animationJobs];
			currentGeneratingId = result.job.id;
			viewMode = result.job.id;
			pollingSet.add(result.job.id);
			clearAllDirections();
			pollJobStatus(result.job.id);
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate animation');
		generating = false;
	}
}

async function pollJobStatus(id: string) {
	let retryCount = 0;
	const maxRetries = 5;

	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/animate/${id}/status`);
			if (!res.ok) {
				retryCount++;
				if (retryCount < maxRetries) {
					await new Promise((r) => setTimeout(r, 3000));
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

			animationJobs = animationJobs.map((j) =>
				j.id === id
					? {
							...j,
							status: result.status,
							progress: result.progress,
							currentStage: result.statusMessage,
							spritesheetUrl: result.spritesheetUrl ?? j.spritesheetUrl,
							frameCount: result.frameCount ?? j.frameCount,
							tileWidth: result.tileWidth ?? j.tileWidth,
							tileHeight: result.tileHeight ?? j.tileHeight,
							directionVideos: result.directionVideos ?? j.directionVideos,
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

			await new Promise((r) => setTimeout(r, 3000));
			return poll();
		} catch {
			retryCount++;
			if (retryCount < maxRetries) {
				await new Promise((r) => setTimeout(r, 3000));
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

async function cancelJob(id: string) {
	if (!confirm('Cancel this animation? Tokens will be refunded.')) return;

	try {
		const res = await fetch(`/api/animate/${id}/cancel`, { method: 'POST' });
		if (res.ok) {
			const result = await res.json();
			animationJobs = animationJobs.map((j) =>
				j.id === id
					? {
							...j,
							status: 'failed' as const,
							errorMessage: 'Cancelled by user',
						}
					: j,
			);
			pollingSet.delete(id);
			if (currentGeneratingId === id) {
				generating = false;
				currentGeneratingId = null;
			}
			tokenState.tokens =
				tokenState.tokens + (result.regularTokensRefunded ?? 0);
			tokenState.bonusTokens =
				tokenState.bonusTokens + (result.bonusTokensRefunded ?? 0);
		} else {
			const error = await res.json();
			alert(error.message || 'Failed to cancel');
		}
	} catch {
		alert('Failed to cancel generation');
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

function getJobPreviewImage(job: AnimationJob): string | null {
	const inputImages = job.directionInputImages as Record<string, string> | null;
	if (inputImages) {
		const firstUrl = Object.values(inputImages)[0];
		if (firstUrl) return firstUrl;
	}
	return job.inputImageUrl || null;
}

function getReexportCost(job: AnimationJob): number {
	const frameCount =
		job.frameCount ??
		ANIMATION_META[job.animationType as AnimationType].framesPerLoop;
	return getAnimationReprocessTokenCost(
		frameCount,
		job.directionCount as 4 | 8,
	);
}

let reexporting = $state(false);

async function reexportJob(id: string) {
	if (reexporting) return;
	reexporting = true;

	try {
		// Set job to processing state locally for immediate UI feedback
		animationJobs = animationJobs.map((j) =>
			j.id === id
				? {
						...j,
						status: 'processing' as const,
						currentStage: 'Starting re-export...',
						progress: 65,
					}
				: j,
		);

		const res = await fetch(`/api/animate/${id}/reexport`, { method: 'POST' });

		if (!res.ok) {
			const err = await res.json();
			alert(err.message || 'Re-export failed');
			// Restore completed state
			animationJobs = animationJobs.map((j) =>
				j.id === id
					? {
							...j,
							status: 'completed' as const,
							currentStage: 'Completed',
							progress: 100,
						}
					: j,
			);
			reexporting = false;
			return;
		}

		const result = await res.json();
		tokenState.tokens = result.tokensRemaining ?? tokenState.tokens;
		tokenState.bonusTokens =
			result.bonusTokensRemaining ?? tokenState.bonusTokens;

		// Start polling to track progress
		pollingSet.add(id);
		currentGeneratingId = id;
		pollJobStatus(id).then(() => {
			reexporting = false;
		});
	} catch {
		alert('Re-export failed');
		reexporting = false;
	}
}

async function downloadArchive() {
	if (!selectedJob?.spritesheetUrl) return;
	try {
		const res = await fetch(selectedJob.spritesheetUrl);
		const blob = await res.blob();
		const blobUrl = URL.createObjectURL(blob);
		const a = document.createElement('a');
		a.href = blobUrl;
		a.download = `frames_${selectedJob.animationType}_${selectedJob.directionCount}dir.zip`;
		a.click();
		URL.revokeObjectURL(blobUrl);
	} catch {
		if (selectedJob?.spritesheetUrl)
			window.open(selectedJob.spritesheetUrl, '_blank');
	}
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

<div class="animate-page">
	<!-- Banner -->
	<div class="beta-banner">
		<div class="beta-icon">
			<Film class="w-5 h-5" />
		</div>
		<div class="beta-content">
			<div class="beta-header">
				<h3 class="beta-title">Sprite Animation</h3>
				<span class="beta-tag">New</span>
			</div>
			<p class="beta-desc">
				<Zap class="w-3 h-3 inline text-amber-400 -mt-0.5" />
				Upload a sprite for each direction and generate animated spritesheets with walk, run, idle, and attack animations.
			</p>
		</div>
	</div>

	<!-- History Bar -->
	<div class="history-bar">
		<div class="flex items-center gap-2">
			<button onclick={startNewGeneration} class="history-new {viewMode === 'new' ? 'history-new-active' : ''}">
				<Plus class="w-6 h-6 {viewMode === 'new' ? 'text-amber-400' : 'text-zinc-500'}" />
			</button>

			{#if animationJobs.length > 0}
				<button onclick={() => scrollHistory('left')} class="history-scroll-btn">
					<ChevronLeft class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}

			<div
				bind:this={historyScrollContainer}
				class="flex-1 flex gap-2 overflow-x-auto"
				style="scrollbar-width: none; -ms-overflow-style: none;"
			>
				{#each animationJobs as job (job.id)}
					<button
						onclick={() => selectJob(job.id)}
						class="history-thumb {viewMode === job.id ? 'history-thumb-active' : ''}"
					>
						{#if job.status === 'completed'}
							{#if getJobPreviewImage(job)}
								<img
									src={getJobPreviewImage(job)}
									alt="Animation"
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

			{#if animationJobs.length > 0}
				<button onclick={() => scrollHistory('right')} class="history-scroll-btn">
					<ChevronRight class="w-4 h-4 text-zinc-400" />
				</button>
			{/if}
		</div>
	</div>

	<!-- Main Content -->
	<div class="main-grid">
		<!-- Left Panel: Input -->
		<div class="panel">
			{#if viewMode === 'new'}
				<h2 class="panel-title">New Animation</h2>

				<!-- Animation Type -->
				<div class="mb-4">
					<label class="field-label mb-2 block">Animation Type</label>
					<div class="grid grid-cols-2 gap-2">
						{#each ANIMATION_TYPES as type}
							{@const meta = ANIMATION_META[type]}
							<button
								onclick={() => { if (meta.available) animationType = type; }}
								disabled={!meta.available}
								class="option-btn {animationType === type ? 'option-btn-active' : ''} {!meta.available ? 'option-btn-disabled' : ''}"
							>
								{ANIMATION_TYPE_LABELS[type]}
								{#if !meta.available}
									<span class="text-xs opacity-50">Coming soon</span>
								{/if}
							</button>
						{/each}
					</div>
				</div>

				<!-- Elevation -->
				<div class="mb-4">
					<label class="field-label mb-2 block">Camera Angle</label>
					<div class="grid grid-cols-2 gap-2">
						{#each ELEVATION_PRESETS as preset}
							<button
								onclick={() => elevation = preset}
								class="option-btn {elevation === preset ? 'option-btn-active' : ''}"
							>
								{ELEVATION_LABELS[preset]}
							</button>
						{/each}
					</div>
				</div>

				<!-- Direction Count -->
				<div class="mb-4">
					<label class="field-label mb-2 block">Directions</label>
					<div class="grid grid-cols-2 gap-2">
						<button
							onclick={() => directionCount = 4}
							class="option-btn {directionCount === 4 ? 'option-btn-active' : ''}"
						>
							4 Directions
							<span class="text-xs opacity-60">({getAnimationGenerationTokenCost(animationType, 4)} tokens)</span>
						</button>
						<button
							onclick={() => directionCount = 8}
							class="option-btn {directionCount === 8 ? 'option-btn-active' : ''}"
						>
							8 Directions
							<span class="text-xs opacity-60">({getAnimationGenerationTokenCost(animationType, 8)} tokens)</span>
						</button>
					</div>
				</div>

				<!-- Fill from Rotations -->
				{#if rotations4.length > 0 || rotations8.length > 0}
					<div class="relative mb-4">
						<button
							onclick={() => showRotationSelector = !showRotationSelector}
							class="sprite-select-btn"
						>
							<ImagePlus class="w-4 h-4" />
							Fill from rotations
						</button>

						{#if showRotationSelector}
							<div class="rotation-dropdown">
								{#if rotations8.length > 0}
									<p class="text-xs text-zinc-500 mb-1.5 font-medium">8-Direction Rotations</p>
									<div class="grid grid-cols-4 gap-2 mb-3">
										{#each rotations8 as rotation (rotation.id)}
											{@const preview = getRotation8PreviewUrl(rotation)}
											{#if preview}
												<button
													onclick={() => { applyRotation8(rotation); showRotationSelector = false; }}
													class="rotation-dropdown-item"
												>
													<img src={preview} alt="8-dir rotation" class="w-full h-full object-contain" />
													<span class="rotation-badge">8</span>
												</button>
											{/if}
										{/each}
									</div>
								{/if}
								{#if rotations4.length > 0}
									<p class="text-xs text-zinc-500 mb-1.5 font-medium">4-Direction Rotations</p>
									<div class="grid grid-cols-4 gap-2">
										{#each rotations4 as rotation (rotation.id)}
											{@const preview = getRotation4PreviewUrl(rotation)}
											{#if preview}
												<button
													onclick={() => { applyRotation4(rotation); showRotationSelector = false; }}
													class="rotation-dropdown-item"
												>
													<img src={preview} alt="4-dir rotation" class="w-full h-full object-contain" />
													<span class="rotation-badge">4</span>
												</button>
											{/if}
										{/each}
									</div>
								{/if}
							</div>
						{/if}
					</div>
				{/if}

				<!-- Per-Direction Image Upload Grid -->
				<div class="mb-4">
					<div class="flex items-center justify-between mb-2">
						<label class="field-label">Direction Images</label>
						<span class="text-xs text-zinc-500">{filledDirectionCount}/{directions.length} filled</span>
					</div>
					<div class="direction-grid {directionCount === 8 ? 'direction-grid-8' : 'direction-grid-4'}">
						{#each directions as dir (dir)}
							{@const preview = getPreviewForDirection(dir)}
							<div class="direction-slot">
								<span class="direction-label">{DIRECTION_LABELS[dir]}</span>
								{#if preview}
									<div class="direction-preview">
										<img src={preview} alt={DIRECTION_FULL_LABELS[dir]} class="w-full h-full object-contain" />
										<button onclick={() => clearDirection(dir)} class="direction-clear">
											<X class="w-3 h-3 text-white" />
										</button>
									</div>
								{:else}
									<div class="direction-upload-wrapper">
										<!-- svelte-ignore a11y_no_static_element_interactions -->
										<div
											ondrop={(e) => handleDropForDirection(dir, e)}
											ondragover={handleDragOver}
											class="direction-upload"
										>
											<input
												type="file"
												accept="image/png,image/jpeg,image/webp"
												onchange={(e) => handleFileSelectForDirection(dir, e)}
												class="absolute inset-0 opacity-0 cursor-pointer"
												id="file-{dir}"
											/>
											<label for="file-{dir}" class="flex flex-col items-center cursor-pointer">
												<Upload class="w-4 h-4 text-zinc-600" />
											</label>
										</div>
										{#if sprites.length > 0}
											<button
												onclick={() => showSpriteSelector = showSpriteSelector === dir ? null : dir}
												class="direction-sprite-btn"
												title="Select from sprites"
											>
												<ImagePlus class="w-3 h-3" />
											</button>
										{/if}

										{#if showSpriteSelector === dir}
											<div class="direction-sprite-dropdown">
												<div class="grid grid-cols-4 gap-1.5">
													{#each sprites as sprite (sprite.id)}
														{@const url = getSpriteUrl(sprite)}
														{#if url}
															<button
																onclick={() => selectSpriteForDirection(dir, url)}
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
							</div>
						{/each}
					</div>
				</div>

				{#if filledDirectionCount > 0}
					<button onclick={clearAllDirections} class="clear-all-btn mb-3">
						<X class="w-3 h-3" />
						Clear all images
					</button>
				{/if}

				<button
					onclick={generate}
					disabled={!hasAnyImage || generating || !canGenerate}
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
					Upload a sprite for each direction to generate animated spritesheets.
					Only directions with images will be animated.
				</p>

			{:else if selectedJob}
				<!-- Viewing Existing Job -->
				<div class="flex items-center justify-between mb-4">
					<h2 class="panel-title" style="margin-bottom:0">
						{#if selectedJob.status === 'processing'}
							Generating...
						{:else if selectedJob.status === 'completed'}
							Animation Complete
						{:else if selectedJob.status === 'failed'}
							Generation Failed
						{:else}
							Queued
						{/if}
					</h2>
					<span class="text-xs text-zinc-500">{formatDate(selectedJob.createdAt)}</span>
				</div>

				{#if selectedJob.status === 'processing' || selectedJob.status === 'pending'}
					<div class="progress-box">
						<Loader2 class="w-12 h-12 animate-spin text-amber-400 mb-4" />
						<p class="text-sm text-zinc-300">{selectedJob.currentStage || 'Processing...'}</p>
						{#if selectedJob.progress > 0}
							<div class="progress-bar-container">
								<div class="progress-bar" style="width: {selectedJob.progress}%"></div>
							</div>
							<p class="text-xs text-zinc-500 mt-1">{selectedJob.progress}%</p>
						{/if}
					</div>
					<button
						onclick={() => selectedJob && cancelJob(selectedJob.id)}
						class="btn-cancel"
					>
						<X class="w-4 h-4" />
						Cancel Generation
					</button>
				{:else if selectedJob.status === 'failed'}
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
					<!-- Direction Input Images Preview -->
					{@const inputImages = selectedJob.directionInputImages as Record<string, string> | null}
					{#if inputImages && Object.keys(inputImages).length > 0}
						<div class="mb-4">
							<span class="field-label mb-2 block">Input Images</span>
							<div class="input-images-grid">
								{#each Object.entries(inputImages) as [dir, url] (dir)}
									<div class="input-image-thumb">
										<img src={url} alt={dir} class="w-full h-full object-contain" />
										<span class="input-image-label">{DIRECTION_LABELS[dir as Direction] || dir}</span>
									</div>
								{/each}
							</div>
						</div>
					{:else if selectedJob.inputImageUrl}
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
					<div class="info-strip mb-2">
						<span class="text-zinc-400">Animation</span>
						<span class="text-white font-medium capitalize">{selectedJob.animationType}</span>
					</div>
					<div class="info-strip mb-2">
						<span class="text-zinc-400">Camera</span>
						<span class="text-white font-medium">{ELEVATION_LABELS[selectedJob.elevation as keyof typeof ELEVATION_LABELS]}</span>
					</div>
					<div class="info-strip mb-2">
						<span class="text-zinc-400">Directions</span>
						<span class="text-white font-medium">{selectedJob.directionCount}</span>
					</div>
					{#if selectedJob.frameCount}
						<div class="info-strip mb-2">
							<span class="text-zinc-400">Frames per direction</span>
							<span class="text-white font-medium">{selectedJob.frameCount}</span>
						</div>
					{/if}
					{#if selectedJob.tileWidth && selectedJob.tileHeight}
						<div class="info-strip mb-2">
							<span class="text-zinc-400">Tile size</span>
							<span class="text-white font-medium">{selectedJob.tileWidth} x {selectedJob.tileHeight}</span>
						</div>
					{/if}

					<div class="flex gap-2 mt-4">
						<button onclick={startNewGeneration} class="btn-secondary flex-1">
							<Plus class="w-4 h-4" />
							New
						</button>
						<button
							onclick={() => selectedJob && reexportJob(selectedJob.id)}
							disabled={reexporting}
							class="btn-secondary flex-1"
							title={selectedJob ? `Re-run background removal on the exported frames and rebuild the ZIP (${getReexportCost(selectedJob)} tokens)` : 'Reprocess export'}
						>
							<RefreshCw class="w-4 h-4 {reexporting ? 'animate-spin' : ''}" />
							Reprocess Export ({getReexportCost(selectedJob)} tokens)
						</button>
					</div>
					<p class="text-xs text-zinc-500 mt-3 text-center">
						Reprocess Export reruns background removal on the extracted animation frames and rebuilds the PNG ZIP.
					</p>
				{/if}
			{/if}
		</div>

		<!-- Right Panel: Output -->
		<div class="panel">
			<div class="flex items-center justify-between mb-4">
				<h2 class="panel-title" style="margin-bottom:0">Animation Output</h2>
				{#if selectedJob?.spritesheetUrl}
					<button onclick={downloadArchive} class="btn-sm-gold">
						<Download class="w-3.5 h-3.5" />
						Download ZIP
					</button>
				{/if}
			</div>

			{#if selectedJob?.status === 'completed' && selectedJob.spritesheetUrl}
				<!-- Completed: show exported PNG frames as preview -->
				{#if archivePreview.loading}
					<div class="empty-output">
						<Loader2 class="w-10 h-10 animate-spin text-zinc-600 mb-3" />
						<p class="text-sm text-zinc-500">Loading exported animation preview...</p>
						<p class="text-xs text-zinc-600 mt-1">Preview source: ZIP archive</p>
					</div>
				{:else if Object.keys(archivePreview.frames).length > 0}
					<div class="direction-videos-grid">
						{#each Object.entries(archivePreview.frames) as [dir] (dir)}
							{@const frameUrl = getArchivePreviewFrame(dir)}
							<div class="direction-video-item direction-frame-item">
								<div class="direction-frame-backdrop"></div>
								{#if frameUrl}
									<img
										src={frameUrl}
										alt={`${DIRECTION_FULL_LABELS[dir as Direction] || dir} exported animation frame`}
										class="direction-frame-image"
									/>
								{/if}
								<span class="direction-video-label">{DIRECTION_LABELS[dir as Direction] || dir}</span>
							</div>
						{/each}
					</div>
				{:else if archivePreview.error}
					<div class="empty-output">
						<X class="w-10 h-10 text-red-400 mb-3" />
						<p class="text-sm text-red-300">Failed to load exported frame preview</p>
						<p class="text-xs text-red-400/70 mt-1">{archivePreview.error}</p>
					</div>
				{/if}

				<div class="archive-info">
					<div class="archive-info-row">
						<span class="text-zinc-400">Preview</span>
						<span class="text-white font-medium">Animated PNG frames</span>
					</div>
					<div class="archive-info-row">
						<span class="text-zinc-400">Format</span>
						<span class="text-white font-medium">ZIP archive with PNG frames</span>
					</div>
					<div class="archive-info-row">
						<span class="text-zinc-400">Structure</span>
						<span class="text-white font-medium">One folder per direction</span>
					</div>
					{#if selectedJob.frameCount}
						<div class="archive-info-row">
							<span class="text-zinc-400">Frames per direction</span>
							<span class="text-white font-medium">{selectedJob.frameCount}</span>
						</div>
					{/if}
					{#if selectedJob.tileWidth && selectedJob.tileHeight}
						<div class="archive-info-row">
							<span class="text-zinc-400">Frame size</span>
							<span class="text-white font-medium">{selectedJob.tileWidth} x {selectedJob.tileHeight}</span>
						</div>
					{/if}
				</div>

			{:else if selectedJob?.status === 'processing' || selectedJob?.status === 'pending'}
				<div class="empty-output">
					<Loader2 class="w-10 h-10 animate-spin text-zinc-600 mb-3" />
					<p class="text-sm text-zinc-500">Generating animation...</p>
					<p class="text-xs text-zinc-600 mt-1">This may take a few minutes</p>
				</div>
			{:else}
				<div class="empty-output">
					<Film class="w-10 h-10 text-zinc-600 mb-3" />
					<p class="text-sm text-zinc-500">Animation output will appear here</p>
					<p class="text-xs text-zinc-600 mt-1">Upload sprites for each direction and choose animation options</p>
				</div>
			{/if}

			<!-- Tips -->
			{#if viewMode === 'new'}
				<div class="tips">
					<p class="text-xs text-zinc-400 mb-2">Tips for best results:</p>
					<ul class="text-xs text-zinc-500 space-y-1">
						<li>Use pre-rotated sprites (e.g. from the Rotate page) for each direction</li>
						<li>Transparent or white backgrounds work best</li>
						<li>Characters in a neutral pose produce better animations</li>
						<li>You don't need to fill all directions — only filled ones will be animated</li>
					</ul>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.animate-page {
		display: flex; flex-direction: column; gap: 1rem;
	}

	/* Banner */
	.beta-banner {
		display: flex; align-items: flex-start; gap: .75rem;
		padding: 1rem 1.25rem;
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(34,197,94,.2);
		border-radius: 1rem;
		backdrop-filter: blur(6px);
	}
	.beta-icon {
		flex-shrink: 0; padding: .5rem;
		background: rgba(34,197,94,.12);
		border-radius: .6rem;
		color: #4ade80;
	}
	.beta-content { flex: 1; min-width: 0; }
	.beta-header { display: flex; align-items: center; gap: .5rem; margin-bottom: .25rem; }
	.beta-title { font-size: .875rem; font-weight: 600; color: #fff; }
	.beta-tag {
		padding: .1rem .45rem;
		font-size: .6rem; font-weight: 700; text-transform: uppercase; letter-spacing: .06em;
		background: rgba(34,197,94,.2);
		color: #86efac;
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

	/* Direction upload grid */
	.direction-grid {
		display: grid;
		gap: .5rem;
	}
	.direction-grid-4 {
		grid-template-columns: repeat(4, 1fr);
	}
	.direction-grid-8 {
		grid-template-columns: repeat(4, 1fr);
	}
	.direction-slot {
		position: relative;
		display: flex; flex-direction: column; align-items: center;
		gap: .25rem;
	}
	.direction-label {
		font-size: .65rem; font-weight: 600; color: #71717a;
		text-transform: uppercase; letter-spacing: .05em;
	}
	.direction-preview {
		position: relative;
		width: 100%; aspect-ratio: 1;
		background: rgba(39,39,42,.4);
		border: 1px solid rgba(63,63,70,.5);
		border-radius: .5rem;
		overflow: hidden;
	}
	.direction-clear {
		position: absolute; top: .2rem; right: .2rem;
		padding: .2rem;
		background: rgba(0,0,0,.6);
		border-radius: .3rem; border: none; cursor: pointer;
		transition: background .2s;
		line-height: 0;
	}
	.direction-clear:hover { background: rgba(0,0,0,.8); }
	.direction-upload-wrapper {
		position: relative;
		width: 100%;
	}
	.direction-upload {
		position: relative;
		width: 100%; aspect-ratio: 1;
		background: rgba(39,39,42,.2);
		border: 1.5px dashed rgba(63,63,70,.5);
		border-radius: .5rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		cursor: pointer;
		transition: border-color .2s, background .2s;
	}
	.direction-upload:hover {
		border-color: rgba(63,63,70,.8);
		background: rgba(39,39,42,.4);
	}
	.direction-sprite-btn {
		position: absolute; bottom: .2rem; right: .2rem;
		padding: .2rem;
		background: rgba(63,63,70,.4);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .3rem;
		color: #a1a1aa;
		cursor: pointer;
		line-height: 0;
		transition: background .2s;
	}
	.direction-sprite-btn:hover {
		background: rgba(63,63,70,.6);
		color: #fff;
	}
	.direction-sprite-dropdown {
		position: absolute; left: 0; top: 100%;
		margin-top: .25rem; padding: .5rem;
		background: rgba(24,24,27,.97);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .5rem;
		box-shadow: 0 8px 30px rgba(0,0,0,.5);
		z-index: 20;
		min-width: 10rem;
		max-height: 10rem; overflow-y: auto;
		backdrop-filter: blur(12px);
	}
	.clear-all-btn {
		display: flex; align-items: center; justify-content: center; gap: .35rem;
		width: 100%;
		padding: .4rem .75rem;
		background: none;
		border: 1px solid rgba(63,63,70,.25);
		border-radius: .5rem;
		font-size: .75rem; color: #71717a;
		cursor: pointer;
		transition: color .2s, border-color .2s;
	}
	.clear-all-btn:hover {
		color: #a1a1aa;
		border-color: rgba(63,63,70,.5);
	}

	/* Input images grid (completed job) */
	.input-images-grid {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: .35rem;
	}
	.input-image-thumb {
		position: relative;
		aspect-ratio: 1;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.3);
		border-radius: .4rem;
		overflow: hidden;
	}
	.input-image-label {
		position: absolute; bottom: .15rem; left: 50%;
		transform: translateX(-50%);
		font-size: .55rem; font-weight: 600;
		color: rgba(255,255,255,.7);
		background: rgba(0,0,0,.5);
		padding: .05rem .25rem;
		border-radius: .2rem;
		text-transform: uppercase;
	}

	/* Option buttons */
	.option-btn {
		display: flex; flex-direction: column; align-items: center;
		gap: .15rem;
		padding: .6rem .5rem;
		background: rgba(39,39,42,.25);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .65rem;
		font-size: .8125rem; font-weight: 500; color: #a1a1aa;
		cursor: pointer;
		transition: all .2s;
	}
	.option-btn:hover {
		background: rgba(63,63,70,.3);
		border-color: rgba(63,63,70,.5);
		color: #fff;
	}
	.option-btn-active {
		color: #fbbf24;
		background: rgba(245,158,11,.08);
		border-color: rgba(245,158,11,.35);
	}
	.option-btn-disabled {
		opacity: .45;
		cursor: not-allowed !important;
	}
	.option-btn-disabled:hover {
		background: rgba(39,39,42,.25);
		border-color: rgba(63,63,70,.35);
		color: #a1a1aa;
	}

	/* Form */
	.field-label { font-size: .8125rem; font-weight: 500; color: #a1a1aa; }

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
		padding: 1.5rem;
	}
	.progress-bar-container {
		width: 80%; height: .35rem; margin-top: .75rem;
		background: rgba(63,63,70,.4);
		border-radius: 9999px;
		overflow: hidden;
	}
	.progress-bar {
		height: 100%;
		background: linear-gradient(90deg, #fbbf24, #f59e0b);
		border-radius: 9999px;
		transition: width .3s ease;
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

	/* Direction videos grid */
	.direction-videos-grid {
		display: grid;
		grid-template-columns: repeat(2, 1fr);
		gap: .5rem;
		margin-bottom: 1rem;
	}
	@media (min-width: 640px) {
		.direction-videos-grid { grid-template-columns: repeat(4, 1fr); }
	}
	.direction-video-item {
		position: relative;
		aspect-ratio: 1;
		background: rgba(39,39,42,.3);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .5rem;
		overflow: hidden;
	}
	.direction-video-label {
		position: absolute; bottom: .2rem; left: 50%;
		transform: translateX(-50%);
		font-size: .6rem; font-weight: 600;
		color: rgba(255,255,255,.8);
		background: rgba(0,0,0,.5);
		padding: .1rem .3rem;
		border-radius: .2rem;
		text-transform: uppercase;
	}
	.direction-frame-item {
		isolation: isolate;
	}
	.direction-frame-backdrop {
		position: absolute;
		inset: 0;
		background:
			linear-gradient(45deg, rgba(255,255,255,.06) 25%, transparent 25%),
			linear-gradient(-45deg, rgba(255,255,255,.06) 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, rgba(255,255,255,.06) 75%),
			linear-gradient(-45deg, transparent 75%, rgba(255,255,255,.06) 75%);
		background-size: 20px 20px;
		background-position: 0 0, 0 10px, 10px -10px, -10px 0;
		opacity: .9;
	}
	.direction-frame-image {
		position: relative;
		z-index: 1;
		width: 100%;
		height: 100%;
		object-fit: contain;
	}

	/* Archive info */
	.archive-info {
		display: flex; flex-direction: column; gap: .35rem;
	}
	.archive-info-row {
		display: flex; align-items: center; justify-content: space-between;
		padding: .6rem .85rem;
		background: rgba(39,39,42,.25);
		border: 1px solid rgba(63,63,70,.25);
		border-radius: .5rem;
		font-size: .8125rem;
	}

	/* Empty output */
	.empty-output {
		aspect-ratio: 16/9;
		background: rgba(39,39,42,.2);
		border: 1px solid rgba(63,63,70,.25);
		border-radius: .85rem;
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		padding: 2rem;
	}

	/* Tips */
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

	/* Rotation dropdown */
	.rotation-dropdown {
		position: absolute; left: 0; right: 0;
		margin-top: .5rem; padding: .75rem;
		background: rgba(24,24,27,.97);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .75rem;
		box-shadow: 0 8px 30px rgba(0,0,0,.5);
		z-index: 15;
		max-height: 16rem; overflow-y: auto;
		backdrop-filter: blur(12px);
	}
	.rotation-dropdown-item {
		position: relative;
		aspect-ratio: 1;
		background: rgba(39,39,42,.4);
		border-radius: .5rem;
		overflow: hidden;
		border: 1px solid rgba(63,63,70,.35);
		cursor: pointer;
		transition: border-color .2s;
	}
	.rotation-dropdown-item:hover { border-color: rgba(245,158,11,.4); }
	.rotation-badge {
		position: absolute; bottom: .15rem; right: .15rem;
		font-size: .5rem; font-weight: 700;
		color: rgba(255,255,255,.8);
		background: rgba(0,0,0,.6);
		padding: .05rem .2rem;
		border-radius: .2rem;
	}

	/* Sprite select button */
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

	/* Sprite dropdown item */
	.sprite-dropdown-item {
		aspect-ratio: 1;
		background: rgba(39,39,42,.4);
		border-radius: .35rem;
		overflow: hidden;
		border: 1px solid rgba(63,63,70,.35);
		cursor: pointer;
		transition: border-color .2s;
	}
	.sprite-dropdown-item:hover { border-color: rgba(245,158,11,.4); }
</style>
