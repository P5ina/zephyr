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
	Download,
	Grid,
	Image,
	Loader2,
	RotateCw,
	Upload,
	X,
} from 'lucide-svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let tokens = $state(data.user.tokens);
let bonusTokens = $state(data.user.bonusTokens);

// Upload state
let inputImage = $state<string | null>(null);
let inputFile = $state<File | null>(null);
let isDragging = $state(false);

// Mode settings
let mode = $state<'regular' | 'pixel_art'>('regular');
let pixelResolution = $state<32 | 64 | 128>(64);
let colorCount = $state<8 | 16 | 32 | 64>(16);

// Generation state
let generating = $state(false);
let status = $state<string | null>(null);
let progress = $state(0);

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

function handleDrop(e: DragEvent) {
	e.preventDefault();
	isDragging = false;

	const file = e.dataTransfer?.files[0];
	if (file && file.type.startsWith('image/')) {
		loadImage(file);
	}
}

function handleFileSelect(e: Event) {
	const input = e.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) {
		loadImage(file);
	}
}

function loadImage(file: File) {
	inputFile = file;
	const reader = new FileReader();
	reader.onload = (e) => {
		inputImage = e.target?.result as string;
	};
	reader.readAsDataURL(file);
}

function clearImage() {
	inputImage = null;
	inputFile = null;
	resetRotations();
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
	if (!inputFile || generating) return;
	if (tokens + bonusTokens < TOKEN_COST) {
		alert('Not enough tokens');
		return;
	}

	generating = true;
	status = 'Uploading image...';
	progress = 0;

	try {
		const formData = new FormData();
		formData.append('image', inputFile);
		formData.append('mode', mode);
		if (mode === 'pixel_art') {
			formData.append('pixelResolution', pixelResolution.toString());
			formData.append('colorCount', colorCount.toString());
		}

		const res = await fetch('/api/rotate/generate', {
			method: 'POST',
			body: formData,
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			return;
		}

		const result = await res.json();

		if (result.id) {
			await pollStatus(result.id);
		} else if (result.rotations) {
			rotations = result.rotations;
			tokens = result.tokensRemaining ?? tokens;
			bonusTokens = result.bonusTokensRemaining ?? bonusTokens;
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate rotations');
	} finally {
		generating = false;
		status = null;
		progress = 0;
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

			if (result.status === 'completed') {
				rotations = result.rotations;
				tokens = result.tokensRemaining ?? tokens;
				bonusTokens = result.bonusTokensRemaining ?? bonusTokens;
				return;
			}

			if (result.status === 'failed') {
				alert(result.error || 'Generation failed');
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

const hasAnyRotation = $derived(Object.values(rotations).some((v) => v !== null));
</script>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
	<!-- Left: Upload & Preview -->
	<div>
		<!-- Upload Area -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 mb-4">
			<h2 class="text-lg font-semibold text-white mb-4">Input Sprite</h2>

			{#if inputImage}
				<div class="relative">
					<div class="aspect-square bg-zinc-800 rounded-lg overflow-hidden border border-zinc-700 flex items-center justify-center">
						<img
							src={inputImage}
							alt="Input sprite"
							class="max-w-full max-h-full object-contain"
						/>
					</div>
					<button
						onclick={clearImage}
						class="absolute top-2 right-2 p-1.5 bg-zinc-900/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-400 rounded-lg transition-colors"
					>
						<X class="w-4 h-4" />
					</button>
				</div>
			{:else}
				<label
					class="block aspect-square border-2 border-dashed rounded-lg cursor-pointer transition-colors
						{isDragging
							? 'border-yellow-500 bg-yellow-500/10'
							: 'border-zinc-700 hover:border-zinc-600 bg-zinc-800/50'}"
					ondragover={(e) => { e.preventDefault(); isDragging = true; }}
					ondragleave={() => (isDragging = false)}
					ondrop={handleDrop}
				>
					<input
						type="file"
						accept="image/*"
						class="hidden"
						onchange={handleFileSelect}
					/>
					<div class="h-full flex flex-col items-center justify-center text-zinc-400">
						<Upload class="w-12 h-12 mb-3 opacity-50" />
						<p class="text-sm font-medium">Drop sprite here</p>
						<p class="text-xs text-zinc-500 mt-1">or click to browse</p>
					</div>
				</label>
			{/if}

			<p class="text-xs text-zinc-500 mt-3 text-center">
				For best results, use a sprite with transparent or solid background
			</p>
		</div>

		<!-- Generation Controls -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<h3 class="text-sm font-medium text-white mb-4">Generation Settings</h3>

			<!-- Mode Selector -->
			<div class="mb-4">
				<span class="block text-xs text-zinc-400 mb-2">Mode</span>
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
					<span class="text-zinc-400">3D Model</span>
					<span class="text-white">TripoSR</span>
				</div>
				<div class="flex items-center justify-between">
					<span class="text-zinc-400">Render resolution</span>
					<span class="text-white">{mode === 'pixel_art' ? `${pixelResolution}x${pixelResolution}` : '512x512'}</span>
				</div>
				{#if mode === 'pixel_art'}
					<div class="flex items-center justify-between">
						<span class="text-zinc-400">Post-processing</span>
						<span class="text-yellow-400">Pixelate + Quantize</span>
					</div>
				{/if}
			</div>

			<!-- Status -->
			{#if status}
				<div class="mt-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
					<div class="flex items-center gap-2">
						<Loader2 class="w-4 h-4 animate-spin text-yellow-400" />
						<span class="text-sm text-yellow-300">{status}</span>
					</div>
					{#if progress > 0}
						<div class="mt-2 h-1.5 bg-zinc-700 rounded-full overflow-hidden">
							<div
								class="h-full bg-yellow-500 transition-all duration-300"
								style="width: {progress}%"
							></div>
						</div>
					{/if}
				</div>
			{/if}

			<!-- Generate Button -->
			<button
				onclick={generate}
				disabled={!inputImage || generating || tokens + bonusTokens < TOKEN_COST}
				class="w-full mt-4 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-zinc-900 disabled:text-zinc-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
			>
				{#if generating}
					<Loader2 class="w-4 h-4 animate-spin" />
					Generating...
				{:else}
					<RotateCw class="w-4 h-4" />
					Generate 8 Directions ({TOKEN_COST} tokens)
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
						<!-- Center cell shows input image -->
						<div class="aspect-square bg-zinc-800/50 rounded-lg border border-zinc-600 flex items-center justify-center overflow-hidden">
							{#if inputImage}
								<img
									src={inputImage}
									alt="Input"
									class="max-w-full max-h-full object-contain opacity-50"
								/>
							{:else}
								<span class="text-xs text-zinc-500">Input</span>
							{/if}
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
				<li>• Use sprites with clear silhouettes</li>
				<li>• Transparent or solid color backgrounds work best</li>
				<li>• Front-facing sprites (N direction) give most consistent results</li>
				<li>• Square images recommended (will be resized to 576x576)</li>
			</ul>
		</div>
	</div>
</div>
