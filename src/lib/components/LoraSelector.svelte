<script lang="ts">
import type { Lora } from '$lib/server/db/schema';

interface SelectedLora {
	id: string;
	scale: number;
}

interface Props {
	loras: Lora[];
	selected: SelectedLora[];
	onchange: (selected: SelectedLora[]) => void;
}

let { loras, selected, onchange }: Props = $props();

function toggleLora(lora: Lora) {
	const existing = selected.find((s) => s.id === lora.id);
	if (existing) {
		onchange(selected.filter((s) => s.id !== lora.id));
	} else if (selected.length < 3) {
		onchange([...selected, { id: lora.id, scale: 0.8 }]);
	}
}

function updateScale(id: string, scale: number) {
	onchange(selected.map((s) => (s.id === id ? { ...s, scale } : s)));
}

function isSelected(id: string): boolean {
	return selected.some((s) => s.id === id);
}

function getScale(id: string): number {
	return selected.find((s) => s.id === id)?.scale ?? 0.8;
}
</script>

<div class="space-y-3">
	<div class="flex items-center justify-between">
		<h3 class="text-sm font-medium text-zinc-300">LoRAs</h3>
		<span class="text-xs text-zinc-500">{selected.length}/3</span>
	</div>

	{#if loras.length === 0}
		<p class="text-sm text-zinc-500">No LoRAs uploaded yet</p>
	{:else}
		<div class="space-y-2">
			{#each loras as lora}
				<div
					class="p-3 rounded-lg border transition-colors {isSelected(lora.id)
						? 'bg-zinc-800 border-yellow-500'
						: 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}"
				>
					<label class="flex items-center gap-3 cursor-pointer">
						<input
							type="checkbox"
							checked={isSelected(lora.id)}
							disabled={!isSelected(lora.id) && selected.length >= 3}
							onchange={() => toggleLora(lora)}
							class="w-4 h-4 rounded border-zinc-600 bg-zinc-900 text-yellow-500 focus:ring-yellow-500 focus:ring-offset-zinc-900"
						/>
						<span class="text-sm text-zinc-200 flex-1 truncate">{lora.name}</span>
					</label>

					{#if isSelected(lora.id)}
						<div class="mt-3 pl-7">
							<div class="flex items-center gap-3">
								<input
									type="range"
									min="0"
									max="1"
									step="0.1"
									value={getScale(lora.id)}
									oninput={(e) =>
										updateScale(lora.id, parseFloat(e.currentTarget.value))}
									class="flex-1 h-1.5 bg-zinc-700 rounded-lg appearance-none cursor-pointer accent-yellow-500"
								/>
								<span class="text-xs text-zinc-400 w-8">{getScale(lora.id).toFixed(1)}</span>
							</div>
						</div>
					{/if}
				</div>
			{/each}
		</div>
	{/if}
</div>
