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
	ImagePlus,
	Loader2,
	Plus,
	RotateCw,
	Sparkles,
	Upload,
	X,
} from 'lucide-svelte';
import type { RotationJob } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const initialJobs = data.rotationJobs;
const sprites = data.sprites;

let tokens = $state(data.user.tokens);
let bonusTokens = $state(data.user.bonusTokens);

// View mode: 'new' for creating new generation, or job ID for viewing existing
let viewMode = $state<'new' | string>(initialJobs.length > 0 ? initialJobs[0].id : 'new');

// Input state for new generation
let selectedImageUrl = $state<string | null>(null);
let uploadedFile = $state<File | null>(null);
let uploadPreviewUrl = $state<string | null>(null);
let showSpriteSelector = $state(false);

// Generation state
let generating = $state(false);
let currentGeneratingId = $state<string | null>(null);

// History
let rotationJobs = $state<RotationJob[]>(initialJobs);

// Track polling
const pollingSet = new Set<string>();

const TOKEN_COST = 8;

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
const selectedJob = $derived(viewMode !== 'new' ? rotationJobs.find(j => j.id === viewMode) : null);

// Derived: rotations to display
const displayRotations = $derived(selectedJob ? {
	n: selectedJob.rotationN,
	ne: selectedJob.rotationNE,
	e: selectedJob.rotationE,
	se: selectedJob.rotationSE,
	s: selectedJob.rotationS,
	sw: selectedJob.rotationSW,
	w: selectedJob.rotationW,
	nw: selectedJob.rotationNW,
} : {
	n: null, ne: null, e: null, se: null, s: null, sw: null, w: null, nw: null,
});

const hasAnyRotation = $derived(Object.values(displayRotations).some((v) => v !== null));
const hasImageSelected = $derived(selectedImageUrl !== null || uploadedFile !== null);
const previewUrl = $derived(uploadPreviewUrl || selectedImageUrl);

// Start polling for any pending jobs on page load
$effect(() => {
	for (const job of initialJobs) {
		if (job.status !== 'completed' && job.status !== 'failed' && !pollingSet.has(job.id)) {
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
	if (file && file.type.startsWith('image/')) {
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
	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/rotate/${id}/status`);
			if (!res.ok) return;

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
			// Ignore errors
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
	for (const dir of Object.keys(displayRotations) as (keyof typeof displayRotations)[]) {
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
	return job.rotationS || job.rotationN || job.rotationE || job.rotationW || null;
}

function getSpriteUrl(sprite: typeof sprites[number]): string | null {
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
						{#if job.status === 'completed' && getJobPreviewImage(job)}
							<img
								src={getJobPreviewImage(job)}
								alt="Rotation"
								class="w-full h-full object-contain bg-zinc-800"
							/>
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
							alt="Selected image"
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
					<div
						ondrop={handleDrop}
						ondragover={handleDragOver}
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
					<button
						onclick={downloadAll}
						class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-white text-xs font-medium rounded-lg transition-colors"
					>
						<Download class="w-3.5 h-3.5" />
						Download
					</button>
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
						<div class="group relative aspect-square bg-zinc-800/50 rounded-lg border border-zinc-700 flex flex-col items-center justify-center overflow-hidden">
							{#if url}
								<img
									src={url}
									alt={dir.label}
									class="w-full h-full object-contain"
								/>
								<button
									onclick={() => downloadRotation(dir.key)}
									class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
								>
									<Download class="w-5 h-5 text-white" />
								</button>
							{:else if selectedJob?.status === 'processing'}
								<Loader2 class="w-5 h-5 animate-spin text-zinc-600" />
							{:else}
								<svelte:component this={dir.icon} class="w-6 h-6 text-zinc-600 mb-1" />
								<span class="text-[10px] text-zinc-500">{dir.label}</span>
							{/if}
						</div>
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
