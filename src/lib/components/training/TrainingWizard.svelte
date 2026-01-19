<script lang="ts">
import { Check, AlertCircle } from 'lucide-svelte';
import ImageUploader from './ImageUploader.svelte';
import CaptionEditor from './CaptionEditor.svelte';
import TrainingConfig from './TrainingConfig.svelte';
import TrainingProgress from './TrainingProgress.svelte';
import type { TrainingJob, TrainingImage, Lora } from '$lib/server/db/schema';

interface Props {
	job: TrainingJob;
	images: TrainingImage[];
	tokens: number;
	bonusTokens: number;
	onjobupdate: (job: TrainingJob) => void;
	onimagesupdate: (images: TrainingImage[]) => void;
	onloracreated: (lora: Lora) => void;
	ontokensupdate: (tokens: number, bonusTokens: number) => void;
}

let {
	job,
	images,
	tokens,
	bonusTokens,
	onjobupdate,
	onimagesupdate,
	onloracreated,
	ontokensupdate,
}: Props = $props();

let starting = $state(false);
let error = $state('');

// Determine initial step based on job status (only runs once on mount)
function getInitialStep(): number {
	if (job.status === 'training' || job.status === 'completed' || job.status === 'failed') {
		return 4;
	} else if (job.status === 'ready') {
		return 3;
	} else if (images.some((img) => img.captionStatus !== 'pending')) {
		return 2;
	}
	return 1;
}

let currentStep = $state(getInitialStep());

// Only auto-navigate for training states (not during upload/caption)
$effect(() => {
	if (job.status === 'training' || job.status === 'completed' || job.status === 'failed') {
		currentStep = 4;
	}
});

let trainingType = $state<'content' | 'style' | 'balanced'>('balanced');
let steps = $state(1000);
let triggerWord = $state('');

const stepLabels = ['Upload', 'Caption', 'Configure', 'Training'];

function handleImageAdd(image: TrainingImage) {
	onimagesupdate([...images, image]);
}

function handleImageRemove(imageId: string) {
	onimagesupdate(images.filter((img) => img.id !== imageId));
}

function handleImagesUpdate(updatedImages: TrainingImage[]) {
	onimagesupdate(updatedImages);
	// Update job status if images are now captioned
	if (updatedImages.every((img) => img.userCaption || img.autoCaption)) {
		onjobupdate({ ...job, status: 'ready' });
	}
}

async function handleStart(config: { trainingType: string; steps: number; triggerWord: string }) {
	starting = true;
	error = '';

	try {
		const res = await fetch(`/api/training/${job.id}/start`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(config),
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.message || 'Failed to start training');
		}

		const data = await res.json();
		onjobupdate({
			...job,
			status: 'training',
			trainingType: config.trainingType as 'content' | 'style' | 'balanced',
			steps: config.steps,
			progress: 0,
		});
		ontokensupdate(data.tokensRemaining, data.bonusTokensRemaining);
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to start training';
	} finally {
		starting = false;
	}
}

function handleJobUpdate(updates: Partial<TrainingJob>) {
	onjobupdate({ ...job, ...updates } as TrainingJob);
}

function handleLoraComplete(lora: Lora) {
	onloracreated(lora);
}

function canGoToStep(step: number): boolean {
	switch (step) {
		case 1:
			return true;
		case 2:
			return images.length > 0;
		case 3:
			return images.every((img) => img.userCaption || img.autoCaption);
		case 4:
			return job.status === 'training' || job.status === 'completed' || job.status === 'failed';
		default:
			return false;
	}
}

function goToStep(step: number) {
	if (canGoToStep(step) && (job.status === 'uploading' || job.status === 'captioning' || job.status === 'ready')) {
		currentStep = step;
	}
}
</script>

<div class="space-y-6">
	<!-- Step indicator -->
	<div class="flex items-center justify-between">
		{#each stepLabels as label, index}
			{@const stepNum = index + 1}
			{@const isActive = currentStep === stepNum}
			{@const isCompleted = currentStep > stepNum}
			{@const isClickable = canGoToStep(stepNum) && job.status !== 'training'}

			<button
				onclick={() => goToStep(stepNum)}
				disabled={!isClickable}
				class="flex items-center gap-2 {isClickable ? 'cursor-pointer' : 'cursor-default'}"
			>
				<div
					class="w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors {isCompleted
						? 'bg-green-500 text-white'
						: isActive
							? 'bg-yellow-500 text-zinc-900'
							: 'bg-zinc-800 text-zinc-400'}"
				>
					{#if isCompleted}
						<Check class="w-4 h-4" />
					{:else}
						{stepNum}
					{/if}
				</div>
				<span
					class="text-sm hidden sm:block {isActive
						? 'text-white font-medium'
						: 'text-zinc-400'}"
				>
					{label}
				</span>
			</button>

			{#if index < stepLabels.length - 1}
				<div class="flex-1 h-0.5 mx-2 bg-zinc-800 {isCompleted ? 'bg-green-500' : ''}"></div>
			{/if}
		{/each}
	</div>

	{#if error}
		<div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
			<AlertCircle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Step content -->
	<div class="min-h-[400px]">
		{#if currentStep === 1}
			<ImageUploader
				jobId={job.id}
				{images}
				onimageadd={handleImageAdd}
				onimageremove={handleImageRemove}
			/>
		{:else if currentStep === 2}
			<CaptionEditor
				jobId={job.id}
				{images}
				bind:triggerWord
				onimagesupdate={handleImagesUpdate}
			/>
		{:else if currentStep === 3}
			<TrainingConfig
				name={job.name}
				bind:trainingType
				bind:steps
				bind:triggerWord
				imageCount={images.length}
				{tokens}
				{bonusTokens}
				onstart={handleStart}
				{starting}
			/>
		{:else if currentStep === 4}
			<TrainingProgress
				{job}
				onupdate={handleJobUpdate}
				oncomplete={handleLoraComplete}
			/>
		{/if}
	</div>

	<!-- Navigation -->
	{#if currentStep < 4 && job.status !== 'training'}
		<div class="flex justify-between pt-4 border-t border-zinc-800">
			<button
				onclick={() => goToStep(currentStep - 1)}
				disabled={currentStep === 1}
				class="px-4 py-2 text-sm text-zinc-400 hover:text-white disabled:opacity-50 disabled:hover:text-zinc-400 transition-colors"
			>
				Back
			</button>
			<button
				onclick={() => goToStep(currentStep + 1)}
				disabled={!canGoToStep(currentStep + 1)}
				class="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-900 disabled:text-zinc-600 text-white text-sm font-medium rounded-lg transition-colors"
			>
				{currentStep === 3 ? 'Review' : 'Continue'}
			</button>
		</div>
	{/if}
</div>
