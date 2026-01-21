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
	Calendar,
	Copy,
	Download,
	Grid,
	History,
	Image,
	Loader2,
	RotateCw,
	Sparkles,
	X,
} from 'lucide-svelte';
import type { RotationJob } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

// svelte-ignore state_referenced_locally
const initialJobs = data.rotationJobs;

let tokens = $state(data.user.tokens);
let bonusTokens = $state(data.user.bonusTokens);

// Prompt input
let prompt = $state('');

// Mode settings
let mode = $state<'regular' | 'pixel_art'>('regular');
let pixelResolution = $state<32 | 64 | 128>(64);
let colorCount = $state<8 | 16 | 32 | 64>(16);

// Generation state
let generating = $state(false);
let status = $state<string | null>(null);
let progress = $state(0);
let estimatedTimeRemaining = $state<number | null>(null);

// Results - 8 directions
let rotations = $state<{
	n: string | null;
	ne: string | null;
	e: string | null;
	se: string | null;
	s: string | null;
	sw: string | null;
	w: string | null;
	nw: string | null;
}>({
	n: null,
	ne: null,
	e: null,
	se: null,
	s: null,
	sw: null,
	w: null,
	nw: null,
});

// History
let rotationJobs = $state<RotationJob[]>(initialJobs);
let selectedJob = $state<RotationJob | null>(null);

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

const examplePrompts = [
	'medieval knight with sword and shield, full body',
	'pixel art wizard casting spell, fantasy RPG style',
	'cyberpunk robot warrior, neon glow',
	'cute slime monster, game character',
	'armored space marine, sci-fi soldier',
];

// Start polling for any pending jobs on page load
$effect(() => {
	for (const job of initialJobs) {
		if (job.status !== 'completed' && job.status !== 'failed' && !pollingSet.has(job.id)) {
			pollingSet.add(job.id);
			pollJobStatus(job.id);
		}
	}
});

function useExample(example: string) {
	prompt = example;
}

function resetRotations() {
	rotations = {
		n: null,
		ne: null,
		e: null,
		se: null,
		s: null,
		sw: null,
		w: null,
		nw: null,
	};
}

async function generate() {
	if (!prompt.trim() || generating) return;
	if (tokens + bonusTokens < TOKEN_COST) {
		alert('Not enough tokens');
		return;
	}

	generating = true;
	status = 'Starting generation...';
	progress = 0;
	estimatedTimeRemaining = null;
	resetRotations();

	try {
		const body: Record<string, unknown> = {
			prompt: prompt.trim(),
			mode,
		};

		if (mode === 'pixel_art') {
			body.pixelResolution = pixelResolution;
			body.colorCount = colorCount;
		}

		const res = await fetch('/api/rotate/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(body),
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			return;
		}

		const result = await res.json();
		tokens = result.tokensRemaining ?? tokens;
		bonusTokens = result.bonusTokensRemaining ?? bonusTokens;

		if (result.job) {
			// Add new job to history
			rotationJobs = [result.job, ...rotationJobs];
			pollingSet.add(result.job.id);
			await pollStatus(result.job.id);
		} else if (result.id) {
			await pollStatus(result.id);
		} else if (result.rotations) {
			rotations = result.rotations;
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate rotations');
	} finally {
		generating = false;
		status = null;
		progress = 0;
		estimatedTimeRemaining = null;
	}
}

async function pollStatus(id: string) {
	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/rotate/${id}/status`);
			if (!res.ok) return;

			const result = await res.json();
			status = result.statusMessage || result.status;
			progress = result.progress || 0;
			estimatedTimeRemaining = result.estimatedTimeRemaining ?? null;

			// Update job in history
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

			if (result.status === 'completed') {
				rotations = result.rotations;
				estimatedTimeRemaining = null;
				pollingSet.delete(id);
				return;
			}

			if (result.status === 'failed') {
				alert(result.error || 'Generation failed');
				estimatedTimeRemaining = null;
				pollingSet.delete(id);
				return;
			}

			await new Promise((r) => setTimeout(r, 2000));
			return poll();
		} catch {
			// Ignore errors, continue polling
		}
	};
	await poll();
}

async function pollJobStatus(id: string) {
	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/rotate/${id}/status`);
			if (!res.ok) return;

			const result = await res.json();

			// Update job in history
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
	const url = rotations[direction as keyof typeof rotations];
	if (!url) return;

	const a = document.createElement('a');
	a.href = url;
	a.download = `sprite_${direction}.png`;
	a.click();
}

function downloadAll() {
	for (const dir of Object.keys(rotations) as (keyof typeof rotations)[]) {
		if (rotations[dir]) {
			setTimeout(() => downloadRotation(dir), 100);
		}
	}
}

function downloadSpriteSheet() {
	// TODO: Generate sprite sheet from all rotations
	alert('Sprite sheet export coming soon!');
}

function openJobModal(job: RotationJob) {
	selectedJob = job;
}

function closeModal() {
	selectedJob = null;
}

function loadJobToPreview(job: RotationJob) {
	rotations = {
		n: job.rotationN,
		ne: job.rotationNE,
		e: job.rotationE,
		se: job.rotationSE,
		s: job.rotationS,
		sw: job.rotationSW,
		w: job.rotationW,
		nw: job.rotationNW,
	};
	closeModal();
}

function copyPrompt(text: string) {
	navigator.clipboard.writeText(text);
}

function formatDate(date: Date | string | null) {
	if (!date) return 'N/A';
	const d = typeof date === 'string' ? new Date(date) : date;
	return d.toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function getStatusLabel(status: string) {
	switch (status) {
		case 'pending':
			return 'Pending';
		case 'processing':
			return 'Processing';
		case 'completed':
			return 'Completed';
		case 'failed':
			return 'Failed';
		default:
			return status;
	}
}

function getJobPreviewImage(job: RotationJob): string | null {
	return job.rotationS || job.rotationN || job.rotationE || job.rotationW || null;
}

const hasAnyRotation = $derived(Object.values(rotations).some((v) => v !== null));
</script>

<div class="space-y-8">
	<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
		<!-- Left: Prompt & Settings -->
		<div>
			<!-- Prompt Input -->
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-4">
				<h2 class="text-lg font-semibold text-white mb-4">Describe Your Sprite</h2>

				<div class="space-y-4">
					<div>
						<textarea
							bind:value={prompt}
							placeholder="Describe the character or object you want to generate..."
							rows="3"
							class="w-full px-4 py-3 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500/50 focus:ring-1 focus:ring-yellow-500/50 resize-none"
						></textarea>
						<p class="text-xs text-zinc-500 mt-2">
							The AI will generate a front-facing sprite, then create 8-directional rotations using 3D reconstruction.
						</p>
					</div>

					<!-- Example Prompts -->
					<div>
						<span class="text-xs text-zinc-400 mb-2 block">Try an example:</span>
						<div class="flex flex-wrap gap-2">
							{#each examplePrompts.slice(0, 3) as example}
								<button
									onclick={() => useExample(example)}
									class="px-3 py-1.5 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg border border-zinc-700 hover:border-zinc-600 transition-colors truncate max-w-[200px]"
									title={example}
								>
									{example.length > 30 ? example.slice(0, 30) + '...' : example}
								</button>
							{/each}
						</div>
					</div>
				</div>
			</div>

			<!-- Generation Controls -->
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
				<h3 class="text-sm font-medium text-white mb-4">Generation Settings</h3>

				<!-- Mode Selector -->
				<div class="mb-4">
					<span class="block text-xs text-zinc-400 mb-2">Output Mode</span>
					<div class="grid grid-cols-2 gap-2">
						<button
							onclick={() => (mode = 'regular')}
							class="flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors {mode === 'regular'
								? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
								: 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'}"
						>
							<Image class="w-4 h-4" />
							<span class="text-sm">Regular</span>
						</button>
						<button
							onclick={() => (mode = 'pixel_art')}
							class="flex items-center justify-center gap-2 p-3 rounded-lg border transition-colors {mode === 'pixel_art'
								? 'bg-yellow-500/10 border-yellow-500/50 text-yellow-400'
								: 'bg-zinc-800/50 border-zinc-700 text-zinc-400 hover:border-zinc-600'}"
						>
							<Grid class="w-4 h-4" />
							<span class="text-sm">Pixel Art</span>
						</button>
					</div>
				</div>

				<!-- Pixel Art Settings -->
				{#if mode === 'pixel_art'}
					<div class="mb-4 p-3 bg-zinc-800/50 rounded-lg border border-zinc-700 space-y-3">
						<div>
							<span class="block text-xs text-zinc-400 mb-2">Output Resolution</span>
							<div class="grid grid-cols-3 gap-2">
								{#each [32, 64, 128] as res}
									<button
										onclick={() => (pixelResolution = res as 32 | 64 | 128)}
										class="py-2 text-xs rounded border transition-colors {pixelResolution === res
											? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
											: 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-zinc-500'}"
									>
										{res}x{res}
									</button>
								{/each}
							</div>
						</div>
						<div>
							<span class="block text-xs text-zinc-400 mb-2">Color Palette</span>
							<div class="grid grid-cols-4 gap-2">
								{#each [8, 16, 32, 64] as colors}
									<button
										onclick={() => (colorCount = colors as 8 | 16 | 32 | 64)}
										class="py-2 text-xs rounded border transition-colors {colorCount === colors
											? 'bg-yellow-500/20 border-yellow-500/50 text-yellow-400'
											: 'bg-zinc-800 border-zinc-600 text-zinc-400 hover:border-zinc-500'}"
									>
										{colors}
									</button>
								{/each}
							</div>
						</div>
					</div>
				{/if}

				<div class="space-y-3 text-sm">
					<div class="flex items-center justify-between">
						<span class="text-zinc-400">Output directions</span>
						<span class="text-white">8 (full rotation)</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-zinc-400">Image generation</span>
						<span class="text-white">Flux Schnell</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-zinc-400">3D reconstruction</span>
						<span class="text-white">TripoSR</span>
					</div>
					<div class="flex items-center justify-between">
						<span class="text-zinc-400">Refinement</span>
						<span class="text-white">ControlNet Canny</span>
					</div>
				</div>

				<!-- Status -->
				{#if status}
					<div class="mt-4 px-4 py-3 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
						<div class="flex items-center justify-between mb-2">
							<div class="flex items-center gap-2">
								<Loader2 class="w-4 h-4 animate-spin text-yellow-400" />
								<span class="text-sm text-yellow-300">{status}</span>
							</div>
							<span class="text-sm text-yellow-400 font-medium">{progress}%</span>
						</div>
						<div class="h-2 bg-zinc-700 rounded-full overflow-hidden">
							<div
								class="h-full bg-gradient-to-r from-yellow-500 to-amber-400 transition-all duration-500 ease-out"
								style="width: {progress}%"
							></div>
						</div>
						{#if estimatedTimeRemaining !== null && estimatedTimeRemaining > 0}
							<p class="text-xs text-zinc-400 mt-2">
								~{Math.floor(estimatedTimeRemaining / 60)}:{(estimatedTimeRemaining % 60).toString().padStart(2, '0')} remaining
							</p>
						{/if}
					</div>
				{/if}

				<!-- Generate Button -->
				<button
					onclick={generate}
					disabled={!prompt.trim() || generating || tokens + bonusTokens < TOKEN_COST}
					class="w-full mt-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-zinc-900 disabled:text-zinc-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
				>
					{#if generating}
						<Loader2 class="w-4 h-4 animate-spin" />
						Generating...
					{:else}
						<Sparkles class="w-4 h-4" />
						Generate 8 Rotations ({TOKEN_COST} tokens)
					{/if}
				</button>
			</div>
		</div>

		<!-- Right: 8-Direction Grid -->
		<div>
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
				<div class="flex items-center justify-between mb-4">
					<h2 class="text-lg font-semibold text-white">8-Direction Output</h2>
					{#if hasAnyRotation}
						<div class="flex items-center gap-2">
							<button
								onclick={downloadAll}
								class="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-xs font-medium rounded-lg transition-colors"
							>
								<Download class="w-3.5 h-3.5" />
								Download All
							</button>
							<button
								onclick={downloadSpriteSheet}
								class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 hover:bg-zinc-600 text-white text-xs font-medium rounded-lg transition-colors"
							>
								Sprite Sheet
							</button>
						</div>
					{/if}
				</div>

				<!-- 3x3 Grid -->
				<div class="grid grid-cols-3 gap-2">
					{#each directions as dir}
						{#if dir.key === 'center'}
							<!-- Center cell shows RotateCw icon -->
							<div class="aspect-square bg-zinc-800/50 rounded-lg border border-zinc-600 flex items-center justify-center overflow-hidden">
								<RotateCw class="w-8 h-8 text-zinc-600" />
							</div>
						{:else}
							<div class="group relative aspect-square bg-zinc-800/50 rounded-lg border border-zinc-700 flex flex-col items-center justify-center overflow-hidden">
								{#if rotations[dir.key as keyof typeof rotations]}
									<img
										src={rotations[dir.key as keyof typeof rotations]}
										alt={dir.label}
										class="w-full h-full object-contain"
									/>
									<button
										onclick={() => downloadRotation(dir.key)}
										class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center"
									>
										<Download class="w-5 h-5 text-white" />
									</button>
								{:else}
									<svelte:component this={dir.icon} class="w-6 h-6 text-zinc-600 mb-1" />
									<span class="text-[10px] text-zinc-500">{dir.label}</span>
									<span class="text-[9px] text-zinc-600">{dir.angle}°</span>
								{/if}
							</div>
						{/if}
					{/each}
				</div>

				<!-- Direction Legend -->
				<div class="mt-4 pt-4 border-t border-zinc-800">
					<p class="text-xs text-zinc-500 text-center">
						N = Front • S = Back • E = Right • W = Left
					</p>
				</div>
			</div>

			<!-- Tips -->
			<div class="mt-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
				<h3 class="text-sm font-medium text-white mb-2">Tips for best results</h3>
				<ul class="text-xs text-zinc-400 space-y-1">
					<li>• Describe a single character or object, not a scene</li>
					<li>• Include "full body" for complete character views</li>
					<li>• Add style hints like "game character", "pixel art", "fantasy RPG"</li>
					<li>• Simple, clear descriptions work better than complex ones</li>
				</ul>
			</div>
		</div>
	</div>

	<!-- History Section -->
	<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
		<div class="flex items-center gap-2 mb-4">
			<History class="w-5 h-5 text-zinc-400" />
			<h2 class="text-lg font-semibold text-white">Generation History</h2>
		</div>

		{#if rotationJobs.length === 0}
			<div class="text-center py-8 text-zinc-500">
				<RotateCw class="w-12 h-12 mx-auto mb-3 opacity-50" />
				<p>No rotations yet. Create your first one!</p>
			</div>
		{:else}
			<div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
				{#each rotationJobs as job (job.id)}
					<button
						onclick={() => openJobModal(job)}
						class="group relative aspect-square bg-zinc-800/50 rounded-lg overflow-hidden border border-zinc-700 hover:border-zinc-600 transition-colors text-left"
					>
						{#if job.status === 'completed' && getJobPreviewImage(job)}
							<img
								src={getJobPreviewImage(job)}
								alt={job.prompt || 'Rotation'}
								class="w-full h-full object-contain"
							/>
						{:else if job.status === 'failed'}
							<div class="w-full h-full flex items-center justify-center text-red-400">
								<div class="text-center">
									<X class="w-6 h-6 mx-auto mb-1" />
									<p class="text-[10px]">Failed</p>
								</div>
							</div>
						{:else}
							<div class="w-full h-full flex flex-col items-center justify-center p-2">
								<Loader2 class="w-6 h-6 animate-spin text-yellow-400 mb-1" />
								<p class="text-[10px] text-zinc-400 text-center">{job.currentStage || getStatusLabel(job.status)}</p>
								{#if job.progress > 0}
									<div class="w-full h-1 bg-zinc-700 rounded-full overflow-hidden mt-1">
										<div
											class="h-full bg-yellow-500 transition-all"
											style="width: {job.progress}%"
										></div>
									</div>
								{/if}
							</div>
						{/if}
						<div class="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-black/80 to-transparent">
							<p class="text-[10px] text-white truncate">{job.prompt || 'No prompt'}</p>
						</div>
					</button>
				{/each}
			</div>
		{/if}
	</div>
</div>

<!-- Detail Modal -->
{#if selectedJob}
	<div
		class="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4"
		onclick={closeModal}
		onkeydown={(e) => e.key === 'Escape' && closeModal()}
		role="dialog"
		tabindex="-1"
	>
		<div
			class="bg-zinc-900 border border-zinc-700 rounded-xl max-w-4xl w-full max-h-[90vh] overflow-hidden"
			onclick={(e) => e.stopPropagation()}
			role="document"
		>
			<!-- Header -->
			<div class="flex items-center justify-between p-4 border-b border-zinc-800">
				<h3 class="text-lg font-semibold text-white">Rotation Details</h3>
				<button
					onclick={closeModal}
					class="p-1 hover:bg-zinc-800 rounded-lg transition-colors"
				>
					<X class="w-5 h-5 text-zinc-400" />
				</button>
			</div>

			<!-- Content -->
			<div class="p-4 overflow-y-auto max-h-[calc(90vh-120px)]">
				<div class="grid grid-cols-1 md:grid-cols-2 gap-6">
					<!-- 3x3 Preview Grid -->
					<div>
						<h4 class="text-sm font-medium text-zinc-400 mb-3">8 Directions</h4>
						<div class="grid grid-cols-3 gap-1.5">
							{#each directions as dir}
								{#if dir.key === 'center'}
									<div class="aspect-square bg-zinc-800/50 rounded-lg border border-zinc-600 flex items-center justify-center">
										<RotateCw class="w-5 h-5 text-zinc-600" />
									</div>
								{:else}
									{@const url = selectedJob[`rotation${dir.label}` as keyof RotationJob] as string | null}
									<div class="aspect-square bg-zinc-800/50 rounded-lg border border-zinc-700 overflow-hidden">
										{#if url}
											<img src={url} alt={dir.label} class="w-full h-full object-contain" />
										{:else}
											<div class="w-full h-full flex items-center justify-center">
												<svelte:component this={dir.icon} class="w-4 h-4 text-zinc-600" />
											</div>
										{/if}
									</div>
								{/if}
							{/each}
						</div>
					</div>

					<!-- Details -->
					<div class="space-y-4">
						<!-- Prompt -->
						<div>
							<div class="flex items-center justify-between mb-1">
								<span class="text-xs text-zinc-500 uppercase tracking-wide">Prompt</span>
								<button
									onclick={() => copyPrompt(selectedJob?.prompt || '')}
									class="p-1 hover:bg-zinc-800 rounded transition-colors"
									title="Copy prompt"
								>
									<Copy class="w-3.5 h-3.5 text-zinc-500" />
								</button>
							</div>
							<p class="text-sm text-white bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								{selectedJob.prompt || 'No prompt'}
							</p>
						</div>

						<!-- Metadata Grid -->
						<div class="grid grid-cols-2 gap-3">
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Mode</span>
								<span class="text-sm text-white capitalize">{selectedJob.mode?.replace('_', ' ') || 'Regular'}</span>
							</div>
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Status</span>
								<span class="text-sm {selectedJob.status === 'completed' ? 'text-green-400' : selectedJob.status === 'failed' ? 'text-red-400' : 'text-yellow-400'}">
									{getStatusLabel(selectedJob.status)}
								</span>
							</div>
							<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
								<span class="text-xs text-zinc-500 block mb-1">Tokens</span>
								<span class="text-sm text-white">{selectedJob.tokenCost}</span>
							</div>
							{#if selectedJob.mode === 'pixel_art'}
								<div class="bg-zinc-800/50 rounded-lg p-3 border border-zinc-700">
									<span class="text-xs text-zinc-500 block mb-1">Resolution</span>
									<span class="text-sm text-white">{selectedJob.pixelResolution || 64}x{selectedJob.pixelResolution || 64}</span>
								</div>
							{/if}
						</div>

						<!-- Dates -->
						<div class="flex items-center gap-2 text-xs text-zinc-500">
							<Calendar class="w-3.5 h-3.5" />
							<span>Created {formatDate(selectedJob.createdAt)}</span>
						</div>

						<!-- Error Message -->
						{#if selectedJob.errorMessage}
							<div class="bg-red-500/10 border border-red-500/20 rounded-lg p-3">
								<span class="text-xs text-red-400 uppercase tracking-wide block mb-1">Error</span>
								<p class="text-sm text-red-300">{selectedJob.errorMessage}</p>
							</div>
						{/if}
					</div>
				</div>
			</div>

			<!-- Footer -->
			<div class="p-4 border-t border-zinc-800 flex justify-end gap-2">
				{#if selectedJob.status === 'completed'}
					<button
						onclick={() => loadJobToPreview(selectedJob!)}
						class="flex items-center gap-2 px-4 py-2 bg-zinc-700 hover:bg-zinc-600 text-white rounded-lg transition-colors"
					>
						<RotateCw class="w-4 h-4" />
						Load to Preview
					</button>
				{/if}
				<button
					onclick={closeModal}
					class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-white rounded-lg transition-colors"
				>
					Close
				</button>
			</div>
		</div>
	</div>
{/if}
