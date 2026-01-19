<script lang="ts">
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
let error = $state('');

function uploadWithProgress(formData: FormData): Promise<{ url: string }> {
	return new Promise((resolve, reject) => {
		const xhr = new XMLHttpRequest();

		xhr.upload.onprogress = (e) => {
			if (e.lengthComputable) {
				uploadProgress = Math.round((e.loaded / e.total) * 100);
			}
		};

		xhr.onload = () => {
			if (xhr.status >= 200 && xhr.status < 300) {
				try {
					resolve(JSON.parse(xhr.responseText));
				} catch {
					reject(new Error('Invalid response'));
				}
			} else {
				try {
					const data = JSON.parse(xhr.responseText);
					reject(new Error(data.message || 'Upload failed'));
				} catch {
					reject(new Error('Upload failed'));
				}
			}
		};

		xhr.onerror = () => reject(new Error('Network error'));

		xhr.open('POST', '/api/upload');
		xhr.send(formData);
	});
}

async function handleUpload() {
	if (!file || !name.trim()) return;

	uploading = true;
	uploadProgress = 0;
	uploadStatus = 'uploading';
	error = '';

	try {
		const formData = new FormData();
		formData.append('file', file);

		const { url } = await uploadWithProgress(formData);

		uploadStatus = 'processing';

		const loraRes = await fetch('/api/loras', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: name.trim(), falUrl: url }),
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
		error = e instanceof Error ? e.message : 'Upload failed';
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
			class="w-full px-3 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-sm text-white placeholder-zinc-500 focus:outline-none focus:border-indigo-500"
		/>

		<label
			class="flex items-center justify-center gap-2 px-3 py-2 bg-zinc-800 border border-zinc-700 border-dashed rounded-lg cursor-pointer hover:border-zinc-600 transition-colors"
		>
			<Upload class="w-4 h-4 text-zinc-400" />
			<span class="text-sm text-zinc-400">
				{file ? file.name : 'Select .safetensors file'}
			</span>
			<input
				type="file"
				accept=".safetensors"
				onchange={handleFileSelect}
				class="hidden"
			/>
		</label>

		{#if error}
			<p class="text-sm text-red-400">{error}</p>
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
						class="h-full bg-indigo-500 transition-all duration-200 ease-out"
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
				class="w-full px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:bg-zinc-700 disabled:text-zinc-500 text-white text-sm font-medium rounded-lg transition-colors"
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
