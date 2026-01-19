<script lang="ts">
import { upload } from '@vercel/blob/client';
import { onMount } from 'svelte';
import { Trash2, Upload } from 'lucide-svelte';
import type { Lora } from '$lib/server/db/schema';

interface Props {
	loras: Lora[];
	onupload: (lora: Lora) => void;
	ondelete: (id: string) => void;
}

let { loras, onupload, ondelete }: Props = $props();

let name = $state('');
let file = $state<File | null>(null);
let uploading = $state(false);
let uploadProgress = $state(0);
let uploadStatus = $state<'uploading' | 'processing' | ''>('');
let errorMsg = $state('');

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB

// Warn user before leaving page during upload
function handleBeforeUnload(e: BeforeUnloadEvent) {
	if (uploading) {
		e.preventDefault();
		return 'Upload in progress. Are you sure you want to leave?';
	}
}

onMount(() => {
	window.addEventListener('beforeunload', handleBeforeUnload);
	return () => window.removeEventListener('beforeunload', handleBeforeUnload);
});

function formatFileSize(bytes: number): string {
	if (bytes < 1024) return `${bytes} B`;
	if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
	return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function handleUpload() {
	if (!file || !name.trim()) return;

	// Validate file size
	if (file.size > MAX_FILE_SIZE) {
		errorMsg = `File too large (${formatFileSize(file.size)}). Maximum size is ${formatFileSize(MAX_FILE_SIZE)}.`;
		return;
	}

	// Validate file extension
	if (!file.name.toLowerCase().endsWith('.safetensors')) {
		errorMsg = 'Only .safetensors files are allowed';
		return;
	}

	uploading = true;
	uploadProgress = 0;
	uploadStatus = 'uploading';
	errorMsg = '';

	try {
		// Upload directly to Vercel Blob (bypasses server body size limit)
		const blob = await upload(file.name, file, {
			access: 'public',
			handleUploadUrl: '/api/upload/token',
			onUploadProgress: (progress) => {
				uploadProgress = Math.round((progress.loaded / progress.total) * 100);
			},
		});

		uploadStatus = 'processing';

		// Create LoRA entry with the blob URL
		const loraRes = await fetch('/api/loras', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: name.trim(), falUrl: blob.url }),
		});

		if (!loraRes.ok) {
			const data = await loraRes.json();
			throw new Error(data.message || 'Failed to create LoRA');
		}

		const { lora } = await loraRes.json();
		onupload(lora);

		name = '';
		file = null;
	} catch (e) {
		errorMsg = e instanceof Error ? e.message : 'Upload failed';
	} finally {
		uploading = false;
		uploadProgress = 0;
		uploadStatus = '';
	}
}

async function handleDelete(id: string) {
	try {
		const res = await fetch('/api/loras', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id }),
		});

		if (res.ok) {
			ondelete(id);
		}
	} catch {
		// Ignore delete errors
	}
}

function handleFileSelect(e: Event) {
	const input = e.target as HTMLInputElement;
	file = input.files?.[0] ?? null;
}
</script>

<div class="space-y-4">
	<h3 class="text-sm font-medium text-zinc-300">LoRA Library</h3>

	<div class="space-y-3 p-4 bg-zinc-900 rounded-lg border border-zinc-800">
		<input
			type="text"
			bind:value={name}
			placeholder="LoRA name"
			class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500"
		/>

		<label
			class="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 border-dashed rounded-lg cursor-pointer hover:border-zinc-600 transition-colors"
		>
			<Upload class="w-4 h-4 text-zinc-400" />
			<span class="text-sm text-zinc-400 truncate max-w-[200px]">
				{#if file}
					{file.name}
					<span class="text-zinc-500">({formatFileSize(file.size)})</span>
				{:else}
					Select .safetensors file
				{/if}
			</span>
			<input
				type="file"
				accept=".safetensors"
				onchange={handleFileSelect}
				class="hidden"
			/>
		</label>

		{#if errorMsg}
			<p class="text-sm text-red-400">{errorMsg}</p>
		{/if}

		{#if uploading}
			<div class="space-y-2">
				<div class="flex items-center justify-between text-sm">
					<span class="text-zinc-400">
						{uploadStatus === 'processing' ? 'Processing...' : 'Uploading...'}
					</span>
					<span class="text-zinc-300">{uploadProgress}%</span>
				</div>
				<div class="w-full h-2 bg-zinc-800 rounded-full overflow-hidden">
					<div
						class="h-full bg-yellow-500 transition-all duration-200 ease-out"
						style="width: {uploadStatus === 'processing' ? 100 : uploadProgress}%"
					></div>
				</div>
				{#if uploadStatus === 'processing'}
					<p class="text-xs text-zinc-500">Saving to library...</p>
				{/if}
			</div>
		{:else}
			<button
				onclick={handleUpload}
				disabled={!file || !name.trim()}
				class="w-full px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
			>
				Upload LoRA
			</button>
		{/if}
	</div>

	{#if loras.length > 0}
		<div class="space-y-2">
			{#each loras as lora}
				<div
					class="flex items-center justify-between p-3 bg-zinc-900 rounded-lg border border-zinc-800"
				>
					<span class="text-sm text-zinc-200 truncate flex-1">{lora.name}</span>
					<button
						onclick={() => handleDelete(lora.id)}
						class="p-1 text-zinc-500 hover:text-red-400 transition-colors"
					>
						<Trash2 class="w-4 h-4" />
					</button>
				</div>
			{/each}
		</div>
	{/if}
</div>
