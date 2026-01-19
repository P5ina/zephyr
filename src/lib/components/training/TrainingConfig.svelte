<script lang="ts">
import { AlertCircle, Coins } from 'lucide-svelte';

interface Props {
	name: string;
	trainingType: 'content' | 'style' | 'balanced';
	steps: number;
	triggerWord: string;
	imageCount: number;
	tokens: number;
	bonusTokens: number;
	onstart: (config: { trainingType: string; steps: number; triggerWord: string }) => void;
	starting: boolean;
}

let {
	name,
	trainingType = $bindable('balanced'),
	steps = $bindable(1000),
	triggerWord = $bindable(''),
	imageCount,
	tokens,
	bonusTokens,
	onstart,
	starting,
}: Props = $props();

const trainingTypes = [
	{
		value: 'content',
		label: 'Content',
		description: 'Best for specific subjects, characters, or objects',
	},
	{
		value: 'style',
		label: 'Style',
		description: 'Best for artistic styles, textures, or visual aesthetics',
	},
	{
		value: 'balanced',
		label: 'Balanced',
		description: 'General purpose, works well for most use cases',
	},
];

// Calculate tokens: 50 tokens per 1000 steps
let tokensRequired = $derived(Math.ceil((steps / 1000) * 50));
let totalTokens = $derived(tokens + bonusTokens);
let hasEnoughTokens = $derived(totalTokens >= tokensRequired);

// Estimate cost
let estimatedCost = $derived((steps / 1000) * 2.26);

function handleStart() {
	onstart({ trainingType, steps, triggerWord: triggerWord.trim() });
}
</script>

<div class="space-y-6">
	<div>
		<h3 class="text-lg font-medium text-white mb-1">Configure Training</h3>
		<p class="text-sm text-zinc-400">
			Training "{name}" with {imageCount} images
		</p>
	</div>

	<!-- Training Type -->
	<div class="space-y-3">
		<label class="block text-sm font-medium text-zinc-300">Training Type</label>
		<div class="grid grid-cols-3 gap-3">
			{#each trainingTypes as type}
				<button
					onclick={() => (trainingType = type.value as 'content' | 'style' | 'balanced')}
					class="p-3 rounded-lg border text-left transition-colors {trainingType === type.value
						? 'bg-yellow-500/10 border-yellow-500 text-white'
						: 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:border-zinc-700'}"
				>
					<span class="block text-sm font-medium">{type.label}</span>
					<span class="block text-xs mt-1 opacity-70">{type.description}</span>
				</button>
			{/each}
		</div>
	</div>

	<!-- Trigger Word -->
	<div class="space-y-2">
		<label for="triggerWord" class="block text-sm font-medium text-zinc-300">
			Trigger Word
		</label>
		<input
			id="triggerWord"
			type="text"
			bind:value={triggerWord}
			placeholder="e.g., ohwx, zphrstyle"
			class="w-full px-4 py-2 bg-zinc-900 border border-zinc-800 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500"
		/>
		<p class="text-xs text-zinc-500">
			A unique word to activate your LoRA. Use this word in your prompts and captions.
		</p>
	</div>

	<!-- Steps -->
	<div class="space-y-3">
		<div class="flex items-center justify-between">
			<label for="steps" class="block text-sm font-medium text-zinc-300">
				Training Steps
			</label>
			<span class="text-sm text-zinc-400">{steps} steps</span>
		</div>
		<input
			id="steps"
			type="range"
			min="100"
			max="5000"
			step="100"
			bind:value={steps}
			class="w-full h-2 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
		/>
		<div class="flex justify-between text-xs text-zinc-500">
			<span>100 (faster)</span>
			<span>5000 (higher quality)</span>
		</div>
	</div>

	<!-- Cost Summary -->
	<div class="p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-3">
		<h4 class="text-sm font-medium text-zinc-300">Cost Summary</h4>
		<div class="space-y-2 text-sm">
			<div class="flex justify-between">
				<span class="text-zinc-400">Training steps</span>
				<span class="text-zinc-300">{steps}</span>
			</div>
			<div class="flex justify-between">
				<span class="text-zinc-400">Images</span>
				<span class="text-zinc-300">{imageCount}</span>
			</div>
			<div class="flex justify-between border-t border-zinc-800 pt-2">
				<span class="text-zinc-400">Tokens required</span>
				<span class="text-white font-medium">{tokensRequired}</span>
			</div>
		</div>
	</div>

	{#if !hasEnoughTokens}
		<div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
			<AlertCircle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
			<div>
				<p class="text-sm text-red-400">Not enough tokens</p>
				<p class="text-xs text-red-400/70 mt-1">
					You have {totalTokens} tokens but need {tokensRequired}.
					<a href="/app/billing" class="underline hover:text-red-300">Get more tokens</a>
				</p>
			</div>
		</div>
	{/if}

	<button
		onclick={handleStart}
		disabled={starting || !hasEnoughTokens || imageCount < 5}
		class="w-full flex items-center justify-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 font-medium rounded-lg transition-colors"
	>
		{#if starting}
			Starting training...
		{:else}
			<Coins class="w-5 h-5" />
			Start Training ({tokensRequired} tokens)
		{/if}
	</button>

	{#if imageCount < 5}
		<p class="text-sm text-center text-zinc-500">
			At least 5 images are required to start training
		</p>
	{/if}
</div>
