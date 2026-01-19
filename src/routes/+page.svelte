<script lang="ts">
import type { PageData } from './$types';
import type { Lora, Generation } from '$lib/server/db/schema';
import ImageGenerator from '$lib/components/ImageGenerator.svelte';
import GenerationHistory from '$lib/components/GenerationHistory.svelte';
import LoraLibrary from '$lib/components/LoraLibrary.svelte';
import { Coins, Settings, X } from 'lucide-svelte';

let { data }: { data: PageData } = $props();

let loras = $state<Lora[]>(data.loras);
let generations = $state<Generation[]>(data.generations);
let tokens = $state(data.user?.tokens ?? 0);
let nsfwEnabled = $state(data.user?.nsfwEnabled ?? true);
let loadingMore = $state(false);
let hasMore = $state(data.generations.length === 20);
let nextCursor = $state<string | null>(
	data.generations.length > 0 ? data.generations[data.generations.length - 1].id : null
);
let settingsOpen = $state(false);
let savingSettings = $state(false);

async function toggleNsfw() {
	savingSettings = true;
	const newValue = !nsfwEnabled;
	try {
		const res = await fetch('/api/settings', {
			method: 'PATCH',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ nsfwEnabled: newValue }),
		});
		if (res.ok) {
			nsfwEnabled = newValue;
		}
	} finally {
		savingSettings = false;
	}
}

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
						<Coins class="w-4 h-4 text-yellow-500" />
						<span class="text-sm font-medium text-white">{tokens}</span>
					</div>
					<div class="relative">
						<button
							onclick={() => (settingsOpen = !settingsOpen)}
							class="p-2 text-zinc-400 hover:text-white transition-colors"
						>
							<Settings class="w-5 h-5" />
						</button>
						{#if settingsOpen}
							<div class="absolute right-0 top-full mt-2 w-64 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
								<div class="flex items-center justify-between p-3 border-b border-zinc-800">
									<span class="text-sm font-medium text-white">Settings</span>
									<button
										onclick={() => (settingsOpen = false)}
										class="text-zinc-400 hover:text-white"
									>
										<X class="w-4 h-4" />
									</button>
								</div>
								<div class="p-3">
									<label class="flex items-center justify-between cursor-pointer">
										<span class="text-sm text-zinc-300">Allow NSFW content</span>
										<button
											onclick={toggleNsfw}
											disabled={savingSettings}
											class="relative w-11 h-6 rounded-full transition-colors {nsfwEnabled
												? 'bg-indigo-600'
												: 'bg-zinc-700'}"
										>
											<span
												class="absolute top-1 left-1 w-4 h-4 bg-white rounded-full transition-transform {nsfwEnabled
													? 'translate-x-5'
													: 'translate-x-0'}"
											></span>
										</button>
									</label>
								</div>
							</div>
						{/if}
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
