<script lang="ts">
import { onMount, onDestroy } from 'svelte';
import { CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp, Terminal } from 'lucide-svelte';
import type { TrainingJob, Lora } from '$lib/server/db/schema';

interface Props {
	job: TrainingJob;
	onupdate: (job: Partial<TrainingJob>) => void;
	oncomplete: (lora: Lora) => void;
}

let { job, onupdate, oncomplete }: Props = $props();

let polling = $state(false);
let pollInterval: ReturnType<typeof setInterval> | null = null;
let logs = $state<string[]>([]);
let showLogs = $state(false);
let logsContainer: HTMLDivElement | null = $state(null);
let queueStatus = $state<string>('');

async function pollStatus() {
	if (polling) return;
	polling = true;

	try {
		const res = await fetch(`/api/training/${job.id}/status`);
		if (!res.ok) {
			const data = await res.json().catch(() => ({}));
			throw new Error(data.message || 'Failed to get status');
		}

		const data = await res.json();

		// Track queue status
		if (data.queueStatus) {
			queueStatus = data.queueStatus;
		}

		// Update logs if available
		if (data.logs && Array.isArray(data.logs)) {
			logs = data.logs;
			// Auto-scroll to bottom if logs are visible
			if (showLogs && logsContainer) {
				setTimeout(() => {
					if (logsContainer) {
						logsContainer.scrollTop = logsContainer.scrollHeight;
					}
				}, 0);
			}
		}

		onupdate({
			status: data.status,
			progress: data.progress,
			errorMessage: data.errorMessage,
			resultLoraId: data.resultLoraId,
		});

		if (data.status === 'completed' && data.lora) {
			oncomplete(data.lora);
			stopPolling();
		} else if (data.status === 'failed') {
			stopPolling();
		}
	} catch (e) {
		console.error('Status poll failed:', e);
	} finally {
		polling = false;
	}
}

function startPolling() {
	if (pollInterval) return;
	pollStatus(); // Immediate first poll
	pollInterval = setInterval(pollStatus, 5000); // Poll every 5 seconds
}

function stopPolling() {
	if (pollInterval) {
		clearInterval(pollInterval);
		pollInterval = null;
	}
}

onMount(() => {
	if (job.status === 'training') {
		startPolling();
	}
});

onDestroy(() => {
	stopPolling();
});

$effect(() => {
	if (job.status === 'training') {
		startPolling();
	} else {
		stopPolling();
	}
});

let statusText = $derived(() => {
	if (job.status === 'training') {
		if (queueStatus === 'PREPARING') {
			return 'Preparing training data...';
		}
		if (queueStatus === 'IN_QUEUE') {
			return 'Waiting in queue...';
		}
		if (queueStatus === 'IN_PROGRESS') {
			return 'Training in progress...';
		}
		return 'Connecting...';
	}
	switch (job.status) {
		case 'completed':
			return 'Training completed!';
		case 'failed':
			return 'Training failed';
		default:
			return 'Preparing...';
	}
});

let progressPercent = $derived(job.progress || 0);
</script>

<div class="space-y-6">
	<div class="text-center">
		{#if job.status === 'completed'}
			<CheckCircle class="w-16 h-16 text-green-400 mx-auto mb-4" />
			<h3 class="text-xl font-medium text-white mb-2">Training Complete!</h3>
			<p class="text-sm text-zinc-400">
				Your LoRA "{job.name}" has been added to your library.
			</p>
		{:else if job.status === 'failed'}
			<AlertCircle class="w-16 h-16 text-red-400 mx-auto mb-4" />
			<h3 class="text-xl font-medium text-white mb-2">Training Failed</h3>
			<p class="text-sm text-red-400">
				{job.errorMessage || 'An error occurred during training.'}
			</p>
		{:else}
			<Loader2 class="w-16 h-16 text-yellow-500 mx-auto mb-4 animate-spin" />
			<h3 class="text-xl font-medium text-white mb-2">{statusText()}</h3>
			<p class="text-sm text-zinc-400">
				{#if queueStatus === 'PREPARING'}
					Zipping and uploading your images. This may take 1-2 minutes...
				{:else if queueStatus === 'IN_QUEUE'}
					Your job is in the queue. Training will start soon...
				{:else}
					This may take 10-30 minutes depending on the number of steps.
				{/if}
			</p>
		{/if}
	</div>

	{#if job.status === 'training'}
		<div class="space-y-2">
			<div class="flex items-center justify-between text-sm">
				<span class="text-zinc-400">Progress</span>
				<span class="text-zinc-300">{progressPercent}%</span>
			</div>
			<div class="w-full h-3 bg-zinc-800 rounded-full overflow-hidden">
				<div
					class="h-full bg-yellow-500 transition-all duration-500 ease-out"
					style="width: {progressPercent}%"
				></div>
			</div>
		</div>

		<div class="p-4 bg-zinc-900 rounded-lg border border-zinc-800">
			<div class="space-y-2 text-sm">
				<div class="flex justify-between">
					<span class="text-zinc-400">LoRA name</span>
					<span class="text-zinc-300">{job.name}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-zinc-400">Training type</span>
					<span class="text-zinc-300 capitalize">{job.trainingType}</span>
				</div>
				<div class="flex justify-between">
					<span class="text-zinc-400">Steps</span>
					<span class="text-zinc-300">{job.steps}</span>
				</div>
				{#if queueStatus}
					<div class="flex justify-between border-t border-zinc-800 pt-2 mt-2">
						<span class="text-zinc-400">Queue status</span>
						<span class="text-zinc-300 font-mono text-xs {queueStatus === 'IN_PROGRESS' ? 'text-green-400' : 'text-yellow-400'}">
							{queueStatus}
						</span>
					</div>
				{/if}
			</div>
		</div>

		<!-- Training Logs -->
		<div class="border border-zinc-800 rounded-lg overflow-hidden">
			<button
				onclick={() => (showLogs = !showLogs)}
				class="w-full flex items-center justify-between p-3 bg-zinc-900 hover:bg-zinc-800 transition-colors"
			>
				<div class="flex items-center gap-2 text-sm text-zinc-400">
					<Terminal class="w-4 h-4" />
					<span>Training Logs</span>
					{#if logs.length > 0}
						<span class="text-xs text-zinc-500">({logs.length} lines)</span>
					{/if}
				</div>
				{#if showLogs}
					<ChevronUp class="w-4 h-4 text-zinc-400" />
				{:else}
					<ChevronDown class="w-4 h-4 text-zinc-400" />
				{/if}
			</button>
			{#if showLogs}
				<div
					bind:this={logsContainer}
					class="max-h-64 overflow-y-auto bg-zinc-950 p-3 font-mono text-xs"
				>
					{#if logs.length > 0}
						{#each logs as log, i}
							<div class="text-zinc-400 whitespace-pre-wrap break-all {log.toLowerCase().includes('error') ? 'text-red-400' : ''} {log.toLowerCase().includes('warning') ? 'text-yellow-400' : ''}">
								<span class="text-zinc-600 select-none mr-2">{String(i + 1).padStart(3, ' ')}</span>{log}
							</div>
						{/each}
					{:else}
						<p class="text-zinc-500 italic">
							{#if queueStatus === 'PREPARING'}
								Packaging and uploading training data...
							{:else if queueStatus === 'IN_QUEUE'}
								Job is queued. Logs will appear once training starts...
							{:else if queueStatus === 'IN_PROGRESS'}
								Training started. Waiting for logs...
							{:else}
								Connecting to training server...
							{/if}
						</p>
					{/if}
				</div>
			{/if}
		</div>
	{/if}

	{#if job.status === 'completed'}
		<div class="flex gap-3">
			<a
				href="/app"
				class="flex-1 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-medium rounded-lg text-center transition-colors"
			>
				Generate with LoRA
			</a>
			<a
				href="/app/train"
				class="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg text-center transition-colors"
			>
				Train Another
			</a>
		</div>
	{/if}

	{#if job.status === 'failed'}
		<div class="flex gap-3">
			<a
				href="/app/train"
				class="flex-1 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-medium rounded-lg text-center transition-colors"
			>
				Try Again
			</a>
			<a
				href="/app/billing"
				class="flex-1 px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-lg text-center transition-colors"
			>
				Get Refund
			</a>
		</div>
		<p class="text-xs text-center text-zinc-500">
			Tokens are automatically refunded when training fails.
		</p>
	{/if}
</div>
