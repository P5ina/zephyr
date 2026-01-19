<script lang="ts">
import { X, Upload, Image as ImageIcon, AlertCircle } from 'lucide-svelte';
import type { TrainingImage } from '$lib/server/db/schema';

interface Props {
	jobId: string;
	images: TrainingImage[];
	onimageadd: (image: TrainingImage) => void;
	onimageremove: (imageId: string) => void;
}

let { jobId, images, onimageadd, onimageremove }: Props = $props();

let uploading = $state(false);
let uploadProgress = $state(0);
let error = $state('');
let dragOver = $state(false);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function uploadFile(file: File) {
	// Validate file type
	if (!file.type.startsWith('image/')) {
		error = `${file.name} is not an image`;
		return;
	}

	// Validate file size
	if (file.size > MAX_FILE_SIZE) {
		error = `${file.name} is too large (max ${formatFileSize(MAX_FILE_SIZE)})`;
		return;
	}

	const formData = new FormData();
	formData.append('file', file);

	const res = await fetch(`/api/training/${jobId}/images`, {
		method: 'POST',
		body: formData,
	});

	if (!res.ok) {
		const data = await res.json().catch(() => ({}));
		throw new Error(data.message || `Failed to upload ${file.name}`);
	}

	const { image } = await res.json();
	onimageadd(image);
}

async function handleFiles(files: FileList | File[]) {
	error = '';
	uploading = true;
	uploadProgress = 0;

	const fileArray = Array.from(files);
	let completed = 0;

	try {
		for (const file of fileArray) {
			await uploadFile(file);
			completed++;
			uploadProgress = Math.round((completed / fileArray.length) * 100);
		}
	} catch (e) {
		error = e instanceof Error ? e.message : 'Upload failed';
	} finally {
		uploading = false;
		uploadProgress = 0;
	}
}

function handleFileSelect(e: Event) {
	const input = e.target as HTMLInputElement;
	if (input.files && input.files.length > 0) {
		handleFiles(input.files);
	}
}

function handleDrop(e: DragEvent) {
	e.preventDefault();
	dragOver = false;
	if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
		handleFiles(e.dataTransfer.files);
	}
}

function handleDragOver(e: DragEvent) {
	e.preventDefault();
	dragOver = true;
}

function handleDragLeave() {
	dragOver = false;
}

async function removeImage(imageId: string) {
	try {
		const res = await fetch(`/api/training/${jobId}/images`, {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ imageId }),
		});

		if (res.ok) {
			onimageremove(imageId);
		}
	} catch {
		// Ignore delete errors
	}
}
</script>

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-lg font-medium text-white">Upload Images</h3>
		<span class="text-sm text-zinc-400">{images.length} images</span>
	</div>

	<p class="text-sm text-zinc-400">
		Upload at least 10 images for best results. Supported formats: JPG, PNG, WebP.
	</p>

	<!-- Drop zone -->
	<label
		class="flex flex-col items-center justify-center gap-3 p-8 border-2 border-dashed rounded-xl cursor-pointer transition-colors {dragOver
			? 'border-yellow-500 bg-yellow-500/10'
			: 'border-zinc-700 hover:border-zinc-600 bg-zinc-900/50'}"
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
	>
		<Upload class="w-8 h-8 text-zinc-400" />
		<div class="text-center">
			<span class="text-sm text-zinc-300">Drop images here or click to browse</span>
			<p class="text-xs text-zinc-500 mt-1">Max {formatFileSize(MAX_FILE_SIZE)} per file</p>
		</div>
		<input
			type="file"
			accept="image/*"
			multiple
			onchange={handleFileSelect}
			class="hidden"
		/>
	</label>

	{#if uploading}
		<div class="space-y-2">
			<div class="flex items-center justify-between text-sm">
				<span class="text-zinc-400">Uploading...</span>
				<span class="text-zinc-300">{uploadProgress}%</span>
			</div>
			<div class="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
				<div
					class="h-full bg-yellow-500 transition-all duration-200 ease-out"
					style="width: {uploadProgress}%"
				></div>
			</div>
		</div>
	{/if}

	{#if error}
		<div class="flex items-start gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
			<AlertCircle class="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
			<p class="text-sm text-red-400">{error}</p>
		</div>
	{/if}

	<!-- Image grid -->
	{#if images.length > 0}
		<div class="grid grid-cols-4 gap-3">
			{#each images as image}
				<div class="relative group aspect-square rounded-lg overflow-hidden bg-zinc-900">
					<img
						src={image.imageUrl}
						alt={image.filename}
						class="w-full h-full object-cover"
					/>
					<button
						onclick={() => removeImage(image.id)}
						class="absolute top-1 right-1 p-1 bg-black/60 rounded-full opacity-0 group-hover:opacity-100 transition-opacity hover:bg-red-500"
					>
						<X class="w-4 h-4 text-white" />
					</button>
				</div>
			{/each}
		</div>
	{:else}
		<div class="flex flex-col items-center justify-center py-12 text-zinc-500">
			<ImageIcon class="w-12 h-12 mb-3 opacity-50" />
			<p class="text-sm">No images uploaded yet</p>
		</div>
	{/if}
</div>
