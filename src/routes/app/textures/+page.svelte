<script lang="ts">
import { Canvas } from '@threlte/core';
import {
	Box,
	Circle,
	Download,
	Loader2,
	RotateCcw,
	Sparkles,
	Square,
	X,
} from 'lucide-svelte';
import MaterialPreview from '$lib/components/three/MaterialPreview.svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let tokens = $state(data.user.tokens);
let bonusTokens = $state(data.user.bonusTokens);

// Generation form
let prompt = $state('');
let generating = $state(false);

// Preview shape
let previewShape = $state<'sphere' | 'cube' | 'plane'>('sphere');
let autoRotate = $state(true);

// Generated textures
let textures = $state<{
	basecolor: string | null;
	normal: string | null;
	roughness: string | null;
	metallic: string | null;
	height: string | null;
}>({
	basecolor: null,
	normal: null,
	roughness: null,
	metallic: null,
	height: null,
});

// Generation status
let status = $state<string | null>(null);

const TOKEN_COST = 5;

async function generate() {
	if (!prompt.trim() || generating) return;
	if (tokens + bonusTokens < TOKEN_COST) {
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
			return;
		}

		const result = await res.json();

		// Poll for status
		if (result.id) {
			await pollStatus(result.id);
		} else if (result.textures) {
			textures = result.textures;
			tokens = result.tokensRemaining ?? tokens;
			bonusTokens = result.bonusTokensRemaining ?? bonusTokens;
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate textures');
	} finally {
		generating = false;
		status = null;
	}
}

async function pollStatus(id: string) {
	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/textures/${id}/status`);
			if (!res.ok) return;

			const result = await res.json();
			status = result.statusMessage || result.status;

			if (result.status === 'completed') {
				textures = result.textures;
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

function downloadTexture(type: keyof typeof textures) {
	const url = textures[type];
	if (!url) return;

	const a = document.createElement('a');
	a.href = url;
	a.download = `${prompt.slice(0, 30).replace(/[^a-z0-9]/gi, '_')}_${type}.png`;
	a.click();
}

function downloadAll() {
	for (const type of Object.keys(textures) as (keyof typeof textures)[]) {
		if (textures[type]) {
			downloadTexture(type);
		}
	}
}

function resetTextures() {
	textures = {
		basecolor: null,
		normal: null,
		roughness: null,
		metallic: null,
		height: null,
	};
}
</script>

<div class="grid grid-cols-1 lg:grid-cols-2 gap-8">
	<!-- Left: 3D Preview -->
	<div class="order-2 lg:order-1">
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl overflow-hidden">
			<div class="flex items-center justify-between px-4 py-3 border-b border-zinc-800">
				<h2 class="text-sm font-medium text-white">3D Preview</h2>
				<div class="flex items-center gap-2">
					<!-- Shape selector -->
					<div class="flex items-center gap-1 bg-zinc-800 rounded-lg p-1">
						<button
							onclick={() => (previewShape = 'sphere')}
							class="p-1.5 rounded transition-colors {previewShape === 'sphere'
								? 'bg-yellow-500 text-zinc-900'
								: 'text-zinc-400 hover:text-white'}"
							title="Sphere"
						>
							<Circle class="w-4 h-4" />
						</button>
						<button
							onclick={() => (previewShape = 'cube')}
							class="p-1.5 rounded transition-colors {previewShape === 'cube'
								? 'bg-yellow-500 text-zinc-900'
								: 'text-zinc-400 hover:text-white'}"
							title="Cube"
						>
							<Box class="w-4 h-4" />
						</button>
						<button
							onclick={() => (previewShape = 'plane')}
							class="p-1.5 rounded transition-colors {previewShape === 'plane'
								? 'bg-yellow-500 text-zinc-900'
								: 'text-zinc-400 hover:text-white'}"
							title="Plane"
						>
							<Square class="w-4 h-4" />
						</button>
					</div>
					<!-- Auto-rotate toggle -->
					<button
						onclick={() => (autoRotate = !autoRotate)}
						class="p-1.5 rounded transition-colors {autoRotate
							? 'bg-yellow-500 text-zinc-900'
							: 'bg-zinc-800 text-zinc-400 hover:text-white'}"
						title="Auto-rotate"
					>
						<RotateCcw class="w-4 h-4" />
					</button>
				</div>
			</div>
			<div class="aspect-square bg-zinc-900">
				<Canvas>
					<MaterialPreview
						basecolorUrl={textures.basecolor}
						normalUrl={textures.normal}
						roughnessUrl={textures.roughness}
						metallicUrl={textures.metallic}
						heightUrl={textures.height}
						shape={previewShape}
						{autoRotate}
					/>
				</Canvas>
			</div>
		</div>

		<!-- Texture Maps Grid -->
		{#if textures.basecolor || textures.normal || textures.roughness || textures.metallic || textures.height}
			<div class="mt-4 bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
				<div class="flex items-center justify-between mb-3">
					<h3 class="text-sm font-medium text-white">Generated Maps</h3>
					<div class="flex items-center gap-2">
						<button
							onclick={downloadAll}
							class="flex items-center gap-1.5 px-3 py-1.5 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-xs font-medium rounded-lg transition-colors"
						>
							<Download class="w-3.5 h-3.5" />
							Download All
						</button>
						<button
							onclick={resetTextures}
							class="p-1.5 text-zinc-400 hover:text-white transition-colors"
							title="Clear textures"
						>
							<X class="w-4 h-4" />
						</button>
					</div>
				</div>
				<div class="grid grid-cols-5 gap-2">
					{#each [
						{ key: 'basecolor', label: 'Color' },
						{ key: 'normal', label: 'Normal' },
						{ key: 'roughness', label: 'Rough' },
						{ key: 'metallic', label: 'Metal' },
						{ key: 'height', label: 'Height' },
					] as map}
						<div class="relative group">
							{#if textures[map.key as keyof typeof textures]}
								<img
									src={textures[map.key as keyof typeof textures]}
									alt={map.label}
									class="w-full aspect-square object-cover rounded-lg border border-zinc-700"
								/>
								<button
									onclick={() => downloadTexture(map.key as keyof typeof textures)}
									class="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-lg"
								>
									<Download class="w-4 h-4 text-white" />
								</button>
							{:else}
								<div class="w-full aspect-square bg-zinc-800 rounded-lg border border-zinc-700 flex items-center justify-center">
									<span class="text-xs text-zinc-500">-</span>
								</div>
							{/if}
							<p class="text-[10px] text-zinc-400 text-center mt-1">{map.label}</p>
						</div>
					{/each}
				</div>
			</div>
		{/if}
	</div>

	<!-- Right: Generation Form -->
	<div class="order-1 lg:order-2">
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8">
			<h2 class="text-lg font-semibold text-white mb-4">Generate PBR Textures</h2>
			<p class="text-sm text-zinc-400 mb-6">
				Describe the material you want to create. We'll generate a complete set of PBR maps
				including basecolor, normal, roughness, metallic, and height.
			</p>

			<!-- Prompt -->
			<div class="mb-4">
				<label for="prompt" class="block text-sm font-medium text-zinc-400 mb-2">
					Material Description
				</label>
				<textarea
					id="prompt"
					bind:value={prompt}
					placeholder="e.g., weathered copper with green patina, brushed steel, rough concrete..."
					rows="4"
					class="w-full px-3 py-2 bg-zinc-800/50 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:ring-2 focus:ring-yellow-500/50 focus:border-yellow-500/50 resize-none"
				></textarea>
			</div>

			<!-- Example prompts -->
			<div class="mb-6">
				<p class="text-xs text-zinc-500 mb-2">Try these:</p>
				<div class="flex flex-wrap gap-2">
					{#each [
						'rusty metal plates',
						'polished marble',
						'worn leather',
						'old brick wall',
						'sci-fi panel',
					] as example}
						<button
							onclick={() => (prompt = example)}
							class="px-2 py-1 text-xs bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded transition-colors"
						>
							{example}
						</button>
					{/each}
				</div>
			</div>

			<!-- Status -->
			{#if status}
				<div class="mb-4 px-3 py-2 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
					<div class="flex items-center gap-2">
						<Loader2 class="w-4 h-4 animate-spin text-yellow-400" />
						<span class="text-sm text-yellow-300">{status}</span>
					</div>
				</div>
			{/if}

			<!-- Generate Button -->
			<button
				onclick={generate}
				disabled={!prompt.trim() || generating || tokens + bonusTokens < TOKEN_COST}
				class="w-full py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-zinc-900 disabled:text-zinc-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
			>
				{#if generating}
					<Loader2 class="w-4 h-4 animate-spin" />
					Generating...
				{:else}
					<Sparkles class="w-4 h-4" />
					Generate Textures ({TOKEN_COST} tokens)
				{/if}
			</button>

			<!-- Info -->
			<p class="mt-4 text-xs text-zinc-500 text-center">
				Generation creates 5 PBR maps: basecolor, normal, roughness, metallic, and height.
				Output resolution: 1024x1024
			</p>
		</div>
	</div>
</div>
