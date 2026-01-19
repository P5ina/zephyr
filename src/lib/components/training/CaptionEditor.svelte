<script lang="ts">
import { Sparkles, Loader2, AlertCircle, Check, Wand2 } from 'lucide-svelte';
import type { TrainingImage } from '$lib/server/db/schema';

interface Props {
	jobId: string;
	images: TrainingImage[];
	triggerWord: string;
	onimagesupdate: (images: TrainingImage[]) => void;
}

let { jobId, images, triggerWord = $bindable(''), onimagesupdate }: Props = $props();

let captioning = $state(false);
let error = $state('');
let editingId = $state<string | null>(null);
let editValue = $state('');
let addingTrigger = $state(false);

async function autoCaptionAll() {
	captioning = true;
	error = '';

	try {
		const res = await fetch(`/api/training/${jobId}/caption`, {
			method: 'POST',
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.message || 'Captioning failed');
		}

		const { images: updatedImages } = await res.json();
		onimagesupdate(updatedImages);
	} catch (e) {
		error = e instanceof Error ? e.message : 'Captioning failed';
	} finally {
		captioning = false;
	}
}

function startEditing(image: TrainingImage) {
	editingId = image.id;
	editValue = image.userCaption || image.autoCaption || '';
}

async function saveCaption(imageId: string) {
	try {
		const res = await fetch(`/api/training/${jobId}/caption`, {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageId, caption: editValue }),
		});

		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.message || 'Failed to save caption');
		}

		const { image } = await res.json();
		const updatedImages = images.map((img) =>
			img.id === imageId ? image : img,
		);
		onimagesupdate(updatedImages);
		editingId = null;
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to save caption';
	}
}

function cancelEditing() {
	editingId = null;
	editValue = '';
}

function getCaptionStatusIcon(status: string) {
	switch (status) {
		case 'processing':
			return Loader2;
		case 'done':
			return Check;
		case 'failed':
			return AlertCircle;
		default:
			return null;
	}
}

function getCaptionStatusColor(status: string) {
	switch (status) {
		case 'processing':
			return 'text-yellow-400';
		case 'done':
			return 'text-green-400';
		case 'failed':
			return 'text-red-400';
		default:
			return 'text-zinc-400';
	}
}

let allCaptioned = $derived(images.every((img) => img.userCaption || img.autoCaption));
let hasPending = $derived(images.some((img) => img.captionStatus === 'pending'));

// Check how many captions are missing the trigger word
let captionsMissingTrigger = $derived(
	triggerWord.trim()
		? images.filter((img) => {
				const caption = img.userCaption || img.autoCaption || '';
				return caption && !caption.toLowerCase().includes(triggerWord.toLowerCase());
			}).length
		: 0
);

async function addTriggerToAll() {
	if (!triggerWord.trim()) return;

	addingTrigger = true;
	error = '';

	const trigger = triggerWord.trim();

	try {
		// Update each caption that doesn't have the trigger word
		for (const image of images) {
			const caption = image.userCaption || image.autoCaption || '';
			if (caption && !caption.toLowerCase().includes(trigger.toLowerCase())) {
				const newCaption = `${trigger}, ${caption}`;

				const res = await fetch(`/api/training/${jobId}/caption`, {
					method: 'PATCH',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ imageId: image.id, caption: newCaption }),
				});

				if (!res.ok) {
					throw new Error('Failed to update caption');
				}
			}
		}

		// Refresh all images
		const res = await fetch(`/api/training/${jobId}`);
		if (res.ok) {
			const data = await res.json();
			onimagesupdate(data.images);
		}
	} catch (e) {
		error = e instanceof Error ? e.message : 'Failed to add trigger word';
	} finally {
		addingTrigger = false;
	}
}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-medium text-white">Edit Captions</h3>
		<button
			onclick={autoCaptionAll}
			disabled={captioning || images.length === 0}
			class="flex items-center gap-2 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
		>
			{#if captioning}
				<Loader2 class="w-4 h-4 animate-spin" />
				Captioning...
			{:else}
				<Sparkles class="w-4 h-4" />
				Auto-caption All
			{/if}
		</button>
	</div>

	<!-- Trigger Word Setup -->
	<div class="p-4 bg-zinc-900 rounded-lg border border-zinc-800 space-y-3">
		<div class="flex items-center justify-between">
			<label for="triggerWord" class="text-sm font-medium text-zinc-300">
				Trigger Word
			</label>
			{#if captionsMissingTrigger > 0}
				<span class="text-xs text-yellow-400">
					{captionsMissingTrigger} caption{captionsMissingTrigger === 1 ? '' : 's'} missing trigger
				</span>
			{/if}
		</div>
		<div class="flex gap-2">
			<input
				id="triggerWord"
				type="text"
				bind:value={triggerWord}
				placeholder="e.g., ohwx, sks, zphrstyle"
				class="flex-1 px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500"
			/>
			<button
				onclick={addTriggerToAll}
				disabled={!triggerWord.trim() || captionsMissingTrigger === 0 || addingTrigger}
				class="flex items-center gap-2 px-3 py-2 bg-zinc-700 hover:bg-zinc-600 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-300 text-sm font-medium rounded-lg transition-colors whitespace-nowrap"
			>
				{#if addingTrigger}
					<Loader2 class="w-4 h-4 animate-spin" />
				{:else}
					<Wand2 class="w-4 h-4" />
				{/if}
				Add to All
			</button>
		</div>
		<p class="text-xs text-zinc-500">
			A unique word to activate your LoRA. Click "Add to All" to prepend it to all captions.
		</p>
	</div>

	<p class="text-sm text-zinc-400">
		{#if hasPending}
			Click "Auto-caption All" to generate captions using AI.
		{:else if allCaptioned}
			Review and edit captions as needed. Good captions improve training quality.
		{:else}
			Some images are missing captions. Click on an image to add a caption manually.
		{/if}
	</p>

	{#if error}
		<div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
			<AlertCircle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<div class="space-y-3">
		{#each images as image}
			<div class="flex gap-4 p-3 bg-zinc-900 rounded-lg border border-zinc-800">
				<div class="shrink-0 w-24 h-24 rounded-lg overflow-hidden bg-zinc-800">
					<img
						src={image.imageUrl}
						alt={image.filename}
						class="w-full h-full object-cover"
					/>
				</div>
				<div class="flex-1 min-w-0">
					<div class="flex items-center gap-2 mb-2">
						<span class="text-sm text-zinc-400 truncate">{image.filename}</span>
						{#if image.captionStatus !== 'pending'}
							{@const Icon = getCaptionStatusIcon(image.captionStatus)}
							{#if Icon}
								<Icon class="w-4 h-4 {getCaptionStatusColor(image.captionStatus)} {image.captionStatus === 'processing' ? 'animate-spin' : ''}" />
							{/if}
						{/if}
					</div>

					{#if editingId === image.id}
						<div class="space-y-2">
							<textarea
								bind:value={editValue}
								rows={3}
								class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500 resize-none"
								placeholder="Describe this image..."
							></textarea>
							<div class="flex gap-2">
								<button
									onclick={() => saveCaption(image.id)}
									class="px-3 py-1 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
								>
									Save
								</button>
								<button
									onclick={cancelEditing}
									class="px-3 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 text-sm font-medium rounded-lg transition-colors"
								>
									Cancel
								</button>
							</div>
						</div>
					{:else}
						<button
							onclick={() => startEditing(image)}
							class="w-full text-left"
						>
							{#if image.userCaption || image.autoCaption}
								<p class="text-sm text-zinc-300 line-clamp-2 hover:text-white transition-colors">
									{image.userCaption || image.autoCaption}
								</p>
							{:else}
								<p class="text-sm text-zinc-500 italic hover:text-zinc-400 transition-colors">
									Click to add caption...
								</p>
							{/if}
						</button>
					{/if}
				</div>
			</div>
		{/each}
	</div>
</div>
