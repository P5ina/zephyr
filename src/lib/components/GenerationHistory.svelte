<script lang="ts">
import type { Generation } from '$lib/server/db/schema';

interface Props {
	generations: Generation[];
	loading?: boolean;
	hasMore?: boolean;
	onloadmore?: () => void;
}

let { generations, loading = false, hasMore = false, onloadmore }: Props = $props();

let hoveredId = $state<string | null>(null);
</script>

<div class="space-y-4">
	<h3 class="text-sm font-medium text-zinc-300">Generation History</h3>

	{#if generations.length === 0 && !loading}
		<p class="text-sm text-zinc-500 text-center py-8">No generations yet</p>
	{:else}
		<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
			{#each generations as gen}
				<div
					class="relative aspect-square rounded-lg overflow-hidden bg-zinc-900 group"
					onmouseenter={() => (hoveredId = gen.id)}
					onmouseleave={() => (hoveredId = null)}
				>
					<img
						src={gen.imageUrl}
						alt={gen.prompt}
						class="w-full h-full object-cover"
					/>

					{#if hoveredId === gen.id}
						<div
							class="absolute inset-0 bg-black/80 p-3 flex flex-col justify-end opacity-0 group-hover:opacity-100 transition-opacity"
						>
							<p class="text-xs text-zinc-300 line-clamp-3">{gen.prompt}</p>
							<p class="text-xs text-zinc-500 mt-1">
								{gen.width}×{gen.height} · Seed: {gen.seed}
							</p>
						</div>
					{/if}
				</div>
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
