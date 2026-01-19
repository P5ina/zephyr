<script lang="ts">
import { AlertCircle } from 'lucide-svelte';
import type { Generation, Lora } from '$lib/server/db/schema';
import LoraSelector from './LoraSelector.svelte';

interface SelectedLora {
	id: string;
	scale: number;
}

interface Props {
	loras: Lora[];
	tokens: number;
	bonusTokens: number;
	ongenerate: (
		generations: Generation[],
		tokensRemaining: number,
		bonusTokensRemaining?: number
	) => void;
}

let { loras, tokens, bonusTokens, ongenerate }: Props = $props();

let totalTokens = $derived(tokens + bonusTokens);

let prompt = $state('');
let width = $state(1024);
let height = $state(1024);
let steps = $state(8);
let numImages = $state(1);
let seed = $state<number | undefined>(undefined);
let selectedLoras = $state<SelectedLora[]>([]);
let generating = $state(false);
let error = $state('');
let generatedImages = $state<Generation[]>([]);

const sizes = [
	{ label: '1:1', width: 1024, height: 1024 },
	{ label: '4:3', width: 1024, height: 768 },
	{ label: '3:4', width: 768, height: 1024 },
	{ label: '16:9', width: 1024, height: 576 },
	{ label: '9:16', width: 576, height: 1024 },
];

async function generate() {
	if (!prompt.trim()) return;

	generating = true;
	error = '';
	generatedImages = [];

	try {
		const res = await fetch('/api/generate', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({
				prompt: prompt.trim(),
				width,
				height,
				numInferenceSteps: steps,
				numImages,
				seed: seed || undefined,
				loras: selectedLoras.length > 0 ? selectedLoras : undefined,
			}),
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(
				data.message ||
					data.error?.message ||
					`Generation failed (${res.status})`,
			);
		}

		const data = await res.json();
		generatedImages = data.generations;
		ongenerate(data.generations, data.tokensRemaining, data.bonusTokensRemaining);
	} catch (e) {
		error = e instanceof Error ? e.message : 'Generation failed';
	} finally {
		generating = false;
	}
}

function setSize(w: number, h: number) {
	width = w;
	height = h;
}

function handleLoraChange(selected: SelectedLora[]) {
	selectedLoras = selected;
}
</script>

<div class="space-y-6">
	<div>
		<label for="prompt" class="block text-sm font-medium text-zinc-300 mb-2">Prompt</label>
		<textarea
			id="prompt"
			bind:value={prompt}
			rows={4}
			placeholder="Describe the image you want to generate..."
			class="w-full px-4 py-3 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500 resize-none"
		></textarea>
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div>
			<label class="block text-sm font-medium text-zinc-300 mb-2">Aspect Ratio</label>
			<div class="flex flex-wrap gap-2">
				{#each sizes as size}
					<button
						onclick={() => setSize(size.width, size.height)}
						class="px-3 py-1.5 text-sm rounded-lg transition-colors {width === size.width &&
						height === size.height
							? 'bg-indigo-600 text-white'
							: 'bg-zinc-800 text-zinc-300 hover:bg-zinc-700'}"
					>
						{size.label}
					</button>
				{/each}
			</div>
		</div>

		<div>
			<label for="steps" class="block text-sm font-medium text-zinc-300 mb-2">
				Steps: {steps}
			</label>
			<input
				id="steps"
				type="range"
				min="1"
				max="8"
				bind:value={steps}
				class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
			/>
		</div>
	</div>

	<div class="grid grid-cols-2 gap-4">
		<div>
			<label for="numImages" class="block text-sm font-medium text-zinc-300 mb-2">
				Images: {numImages}
			</label>
			<input
				id="numImages"
				type="range"
				min="1"
				max="4"
				bind:value={numImages}
				class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-indigo-500"
			/>
		</div>

		<div>
			<label for="seed" class="block text-sm font-medium text-zinc-300 mb-2">Seed (optional)</label>
			<input
				id="seed"
				type="number"
				bind:value={seed}
				placeholder="Random"
				class="w-full px-3 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
			/>
		</div>
	</div>

	{#if loras.length > 0}
		<LoraSelector {loras} selected={selectedLoras} onchange={handleLoraChange} />
	{/if}

	{#if error}
		<div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
			<AlertCircle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<button
		onclick={generate}
		disabled={generating || !prompt.trim() || totalTokens < numImages}
		class="w-full px-6 py-3 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white font-medium rounded-lg transition-colors"
	>
		{#if generating}
			Generating...
		{:else if totalTokens < numImages}
			Not enough tokens
		{:else}
			Generate ({numImages} {numImages === 1 ? 'token' : 'tokens'})
		{/if}
	</button>

	{#if generatedImages.length > 0}
		<div class="grid grid-cols-2 gap-4">
			{#each generatedImages as gen}
				<div class="relative aspect-square rounded-lg overflow-hidden bg-zinc-900">
					<img src={gen.imageUrl} alt={gen.prompt} class="w-full h-full object-cover" />
				</div>
			{/each}
		</div>
	{/if}
</div>
