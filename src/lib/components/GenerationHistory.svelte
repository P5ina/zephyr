<script lang="ts">
import { Check, CheckSquare, Copy, Download, Square, Trash2, X } from 'lucide-svelte';
import type { Generation } from '$lib/server/db/schema';

interface Props {
	generations: Generation[];
	loading?: boolean;
	hasMore?: boolean;
	onloadmore?: () => void;
	ondelete?: (id: string) => void;
	ondeletemany?: (ids: string[]) => void;
}

let {
	generations,
	loading = false,
	hasMore = false,
	onloadmore,
	ondelete,
	ondeletemany,
}: Props = $props();

let hoveredId = $state<string | null>(null);
let selectedGeneration = $state<Generation | null>(null);
let copied = $state(false);
let deleting = $state(false);

// Multi-select state
let selectMode = $state(false);
let selectedIds = $state<Set<string>>(new Set());
let deletingMultiple = $state(false);

function toggleSelectMode() {
	selectMode = !selectMode;
	if (!selectMode) {
		selectedIds = new Set();
	}
}

function toggleSelection(id: string, e?: Event) {
	e?.stopPropagation();
	const newSet = new Set(selectedIds);
	if (newSet.has(id)) {
		newSet.delete(id);
	} else {
		newSet.add(id);
	}
	selectedIds = newSet;
}

function selectAll() {
	if (selectedIds.size === generations.length) {
		selectedIds = new Set();
	} else {
		selectedIds = new Set(generations.map(g => g.id));
	}
}

async function deleteSelected() {
	if (selectedIds.size === 0 || deletingMultiple) return;

	const count = selectedIds.size;
	if (!confirm(`Delete ${count} generation${count > 1 ? 's' : ''}? This cannot be undone.`)) return;

	deletingMultiple = true;
	try {
		const ids = Array.from(selectedIds);
		const res = await fetch('/api/generations', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids }),
		});

		if (res.ok) {
			ondeletemany?.(ids);
			selectedIds = new Set();
			selectMode = false;
		}
	} finally {
		deletingMultiple = false;
	}
}

function openModal(gen: Generation) {
	if (selectMode) {
		toggleSelection(gen.id);
		return;
	}
	selectedGeneration = gen;
}

function closeModal() {
	selectedGeneration = null;
}

function handleKeydown(e: KeyboardEvent) {
	if (e.key === 'Escape') {
		if (selectedGeneration) {
			closeModal();
		} else if (selectMode) {
			toggleSelectMode();
		}
	}
}

async function copyPrompt() {
	if (!selectedGeneration) return;
	await navigator.clipboard.writeText(selectedGeneration.prompt);
	copied = true;
	setTimeout(() => (copied = false), 2000);
}

function downloadImage() {
	if (!selectedGeneration) return;
	const link = document.createElement('a');
	link.href = selectedGeneration.imageUrl;
	link.download = `zephyr-${selectedGeneration.visibleId}.png`;
	link.click();
}

async function deleteGeneration() {
	if (!selectedGeneration || deleting) return;

	if (!confirm('Delete this generation? This cannot be undone.')) return;

	deleting = true;
	try {
		const res = await fetch('/api/generations', {
			method: 'DELETE',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ id: selectedGeneration.id }),
		});

		if (res.ok) {
			ondelete?.(selectedGeneration.id);
			closeModal();
		}
	} finally {
		deleting = false;
	}
}
</script>

<svelte:window onkeydown={handleKeydown} />

<div class="space-y-4">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium text-zinc-300">Generation History</h3>
		{#if generations.length > 0}
			<button
				onclick={toggleSelectMode}
				class="text-xs text-zinc-400 hover:text-white transition-colors"
			>
				{selectMode ? 'Cancel' : 'Select'}
			</button>
		{/if}
	</div>

	{#if selectMode && generations.length > 0}
		<div class="flex items-center justify-between p-3 bg-zinc-800/50 rounded-lg border border-zinc-700">
			<div class="flex items-center gap-3">
				<button
					onclick={selectAll}
					class="flex items-center gap-2 text-sm text-zinc-300 hover:text-white transition-colors"
				>
					{#if selectedIds.size === generations.length}
						<CheckSquare class="w-4 h-4 text-yellow-500" />
					{:else}
						<Square class="w-4 h-4" />
					{/if}
					Select all
				</button>
				<span class="text-sm text-zinc-500">
					{selectedIds.size} selected
				</span>
			</div>
			<button
				onclick={deleteSelected}
				disabled={selectedIds.size === 0 || deletingMultiple}
				class="flex items-center gap-2 px-3 py-1.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
			>
				<Trash2 class="w-4 h-4" />
				{deletingMultiple ? 'Deleting...' : 'Delete'}
			</button>
		</div>
	{/if}

	{#if generations.length === 0 && !loading}
		<p class="text-sm text-zinc-500 text-center py-8">No generations yet</p>
	{:else}
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
			{#each generations as gen}
				<button
					type="button"
					class="relative aspect-square rounded-lg overflow-hidden bg-zinc-900 group cursor-pointer text-left {selectMode && selectedIds.has(gen.id) ? 'ring-2 ring-yellow-500' : ''}"
					onmouseenter={() => (hoveredId = gen.id)}
					onmouseleave={() => (hoveredId = null)}
					onclick={() => openModal(gen)}
				>
					<img
						src={gen.imageUrl}
						alt={gen.prompt}
						class="w-full h-full object-cover"
					/>

					{#if selectMode}
						<div class="absolute top-2 left-2 z-10">
							{#if selectedIds.has(gen.id)}
								<div class="w-6 h-6 bg-yellow-500 rounded flex items-center justify-center">
									<Check class="w-4 h-4 text-zinc-900" />
								</div>
							{:else}
								<div class="w-6 h-6 bg-zinc-800/80 border border-zinc-600 rounded"></div>
							{/if}
						</div>
					{/if}

					{#if hoveredId === gen.id && !selectMode}
						<div
							class="absolute inset-0 bg-black/80 p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<p class="text-xs text-zinc-300 line-clamp-3">{gen.prompt}</p>
							<p class="text-xs text-zinc-500 mt-1">
								{gen.width}×{gen.height} · Seed: {gen.seed}
							</p>
						</div>
					{/if}
				</button>
			{/each}
		</div>

		{#if hasMore}
			<button
				onclick={onloadmore}
				disabled={loading}
				class="w-full py-2 text-sm text-zinc-400 hover:text-white transition-colors"
			>
				{loading ? 'Loading...' : 'Load more'}
			</button>
		{/if}
	{/if}
</div>

<!-- Full Image Modal -->
{#if selectedGeneration}
	<div
		class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
		onclick={closeModal}
		role="dialog"
		aria-modal="true"
	>
		<div
			class="relative max-w-5xl w-full max-h-[90vh] flex flex-col md:flex-row gap-6 bg-zinc-900 rounded-2xl border border-zinc-800 overflow-hidden"
			onclick={(e) => e.stopPropagation()}
		>
			<!-- Close button -->
			<button
				onclick={closeModal}
				class="absolute top-4 right-4 z-10 p-2 bg-zinc-800/80 hover:bg-zinc-700 rounded-lg transition-colors"
				aria-label="Close modal"
			>
				<X class="w-5 h-5 text-white" />
			</button>

			<!-- Image -->
			<div class="flex-1 min-h-0 flex items-center justify-center bg-zinc-950 p-4">
				<img
					src={selectedGeneration.imageUrl}
					alt={selectedGeneration.prompt}
					class="max-w-full max-h-[60vh] md:max-h-[80vh] object-contain rounded-lg"
				/>
			</div>

			<!-- Details panel -->
			<div class="w-full md:w-80 p-6 flex flex-col gap-4 overflow-y-auto border-t md:border-t-0 md:border-l border-zinc-800">
				<div>
					<h3 class="text-sm font-medium text-zinc-400 mb-2">Prompt</h3>
					<p class="text-sm text-zinc-200 leading-relaxed">{selectedGeneration.prompt}</p>
				</div>

				<div class="grid grid-cols-2 gap-4">
					<div>
						<h4 class="text-xs font-medium text-zinc-500 mb-1">Size</h4>
						<p class="text-sm text-zinc-300">{selectedGeneration.width}×{selectedGeneration.height}</p>
					</div>
					<div>
						<h4 class="text-xs font-medium text-zinc-500 mb-1">Seed</h4>
						<p class="text-sm text-zinc-300 font-mono">{selectedGeneration.seed}</p>
					</div>
				</div>

				{#if selectedGeneration.loraIds && selectedGeneration.loraIds.length > 0}
					<div>
						<h4 class="text-xs font-medium text-zinc-500 mb-1">LoRAs Used</h4>
						<p class="text-sm text-zinc-300">{selectedGeneration.loraIds.length} LoRA{selectedGeneration.loraIds.length > 1 ? 's' : ''}</p>
					</div>
				{/if}

				<div>
					<h4 class="text-xs font-medium text-zinc-500 mb-1">Created</h4>
					<p class="text-sm text-zinc-300">
						{new Date(selectedGeneration.createdAt).toLocaleDateString(undefined, {
							year: 'numeric',
							month: 'short',
							day: 'numeric',
							hour: '2-digit',
							minute: '2-digit'
						})}
					</p>
				</div>

				<!-- Actions -->
				<div class="flex flex-col gap-2 mt-auto pt-4 border-t border-zinc-800">
					<div class="flex gap-2">
						<button
							onclick={copyPrompt}
							class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-lg transition-colors"
						>
							{#if copied}
								<Check class="w-4 h-4 text-green-400" />
								Copied!
							{:else}
								<Copy class="w-4 h-4" />
								Copy Prompt
							{/if}
						</button>
						<button
							onclick={downloadImage}
							class="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
						>
							<Download class="w-4 h-4" />
							Download
						</button>
					</div>
					<button
						onclick={deleteGeneration}
						disabled={deleting}
						class="flex items-center justify-center gap-2 px-4 py-2.5 bg-red-500/10 hover:bg-red-500/20 text-red-400 text-sm font-medium rounded-lg transition-colors disabled:opacity-50"
					>
						<Trash2 class="w-4 h-4" />
						{deleting ? 'Deleting...' : 'Delete'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
