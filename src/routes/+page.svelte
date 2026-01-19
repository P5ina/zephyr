<script lang="ts">
import type { PageData } from './$types';
import type { Lora, Generation } from '$lib/server/db/schema';
import ImageGenerator from '$lib/components/ImageGenerator.svelte';
import GenerationHistory from '$lib/components/GenerationHistory.svelte';
import LoraLibrary from '$lib/components/LoraLibrary.svelte';

let { data }: { data: PageData } = $props();

let loras = $state<Lora[]>(data.loras);
let generations = $state<Generation[]>(data.generations);
let tokens = $state(data.user?.tokens ?? 0);
let loadingMore = $state(false);
let hasMore = $state(data.generations.length === 20);
let nextCursor = $state<string | null>(
	data.generations.length > 0 ? data.generations[data.generations.length - 1].id : null
);

function handleGenerate(newGenerations: Generation[], tokensRemaining: number) {
	generations = [...newGenerations, ...generations];
	tokens = tokensRemaining;
}

function handleLoraUpload(lora: Lora) {
	loras = [lora, ...loras];
}

function handleLoraDelete(id: string) {
	loras = loras.filter((l) => l.id !== id);
}

async function loadMoreGenerations() {
	if (loadingMore || !nextCursor) return;

	loadingMore = true;
	try {
		const res = await fetch(`/api/generations?cursor=${nextCursor}&limit=20`);
		if (res.ok) {
			const data = await res.json();
			generations = [...generations, ...data.generations];
			nextCursor = data.nextCursor;
			hasMore = !!data.nextCursor;
		}
	} finally {
		loadingMore = false;
	}
}
</script>

{#if !data.user}
	<div class="min-h-screen flex items-center justify-center bg-zinc-950">
		<div class="text-center">
			<h1 class="text-4xl font-bold text-white mb-4">Zephyr</h1>
			<p class="text-zinc-400 mb-8">AI Image Generation with Custom LoRA Support</p>
			<a
				href="/login"
				class="inline-flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg transition-colors"
			>
				Sign in to get started
			</a>
		</div>
	</div>
{:else}
	<div class="min-h-screen bg-zinc-950">
		<header class="border-b border-zinc-800">
			<div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
				<h1 class="text-xl font-bold text-white">Zephyr</h1>
				<div class="flex items-center gap-4">
					<div class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 rounded-lg">
						<svg class="w-4 h-4 text-yellow-500" fill="currentColor" viewBox="0 0 20 20">
							<path d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.736 6.979C9.208 6.193 9.696 6 10 6c.304 0 .792.193 1.264.979a1 1 0 001.715-1.029C12.279 4.784 11.232 4 10 4s-2.279.784-2.979 1.95c-.285.475-.507 1-.67 1.55H6a1 1 0 000 2h.013a9.358 9.358 0 000 1H6a1 1 0 100 2h.351c.163.55.385 1.075.67 1.55C7.721 15.216 8.768 16 10 16s2.279-.784 2.979-1.95a1 1 0 10-1.715-1.029c-.472.786-.96.979-1.264.979-.304 0-.792-.193-1.264-.979a4.265 4.265 0 01-.264-.521H10a1 1 0 100-2H8.017a7.36 7.36 0 010-1H10a1 1 0 100-2H8.472c.08-.185.167-.36.264-.521z"/>
						</svg>
						<span class="text-sm font-medium text-white">{tokens}</span>
					</div>
					{#if data.user.avatarUrl}
						<img
							src={data.user.avatarUrl}
							alt={data.user.username || data.user.email}
							class="w-8 h-8 rounded-full"
						/>
					{/if}
					<span class="text-sm text-zinc-300">{data.user.username || data.user.email}</span>
					<a href="/logout" class="text-sm text-zinc-500 hover:text-white transition-colors">
						Sign out
					</a>
				</div>
			</div>
		</header>

		<main class="max-w-7xl mx-auto px-4 py-8">
			<div class="grid grid-cols-1 lg:grid-cols-12 gap-8">
				<div class="lg:col-span-8 space-y-8">
					<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
						<ImageGenerator {loras} {tokens} ongenerate={handleGenerate} />
					</div>

					<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
						<GenerationHistory
							{generations}
							loading={loadingMore}
							{hasMore}
							onloadmore={loadMoreGenerations}
						/>
					</div>
				</div>

				<div class="lg:col-span-4">
					<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8">
						<LoraLibrary {loras} onupload={handleLoraUpload} ondelete={handleLoraDelete} />
					</div>
				</div>
			</div>
		</main>
	</div>
{/if}
