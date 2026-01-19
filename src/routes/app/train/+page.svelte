<script lang="ts">
import {
	Coins,
	Settings,
	X,
	Plus,
	Clock,
	CheckCircle,
	AlertCircle,
	Loader2,
	Trash2,
} from 'lucide-svelte';
import TrainingWizard from '$lib/components/training/TrainingWizard.svelte';
import type { TrainingJob, TrainingImage, Lora } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let jobs = $state<TrainingJob[]>(data.jobs);
let tokens = $state(data.user.tokens);
let bonusTokens = $state(data.user.bonusTokens);
let nsfwEnabled = $state(data.user.nsfwEnabled);
let settingsOpen = $state(false);
let savingSettings = $state(false);

// Current active job being edited
let activeJob = $state<TrainingJob | null>(null);
let activeImages = $state<TrainingImage[]>([]);
let creatingJob = $state(false);
let newJobName = $state('');
let showNewJobModal = $state(false);

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

async function createNewJob() {
	if (!newJobName.trim()) return;

	creatingJob = true;
	try {
		const res = await fetch('/api/training', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: newJobName.trim() }),
		});

		if (!res.ok) {
			throw new Error('Failed to create training job');
		}

		const { job } = await res.json();
		jobs = [job, ...jobs];
		activeJob = job;
		activeImages = [];
		showNewJobModal = false;
		newJobName = '';
	} catch (e) {
		console.error('Failed to create job:', e);
	} finally {
		creatingJob = false;
	}
}

async function selectJob(job: TrainingJob) {
	try {
		const res = await fetch(`/api/training/${job.id}`);
		if (!res.ok) {
			throw new Error('Failed to load training job');
		}

		const data = await res.json();
		activeJob = data.job;
		activeImages = data.images;
	} catch (e) {
		console.error('Failed to load job:', e);
	}
}

async function deleteJob(jobId: string) {
	try {
		const res = await fetch(`/api/training/${jobId}`, {
			method: 'DELETE',
		});

		if (res.ok) {
			const data = await res.json();

			// Update tokens if refunded
			if (data.tokensRefunded > 0) {
				bonusTokens += data.tokensRefunded;
				alert(`Job deleted. ${data.tokensRefunded} tokens refunded.`);
			}

			jobs = jobs.filter((j) => j.id !== jobId);
			if (activeJob?.id === jobId) {
				activeJob = null;
				activeImages = [];
			}
		}
	} catch {
		// Ignore delete errors
	}
}

function handleJobUpdate(job: TrainingJob) {
	activeJob = job;
	jobs = jobs.map((j) => (j.id === job.id ? job : j));
}

function handleImagesUpdate(images: TrainingImage[]) {
	activeImages = images;
}

function handleLoraCreated(lora: Lora) {
	// Could navigate to /app or show a notification
	console.log('LoRA created:', lora);
}

function handleTokensUpdate(newTokens: number, newBonusTokens: number) {
	tokens = newTokens;
	bonusTokens = newBonusTokens;
}

function getStatusIcon(status: string) {
	switch (status) {
		case 'completed':
			return CheckCircle;
		case 'failed':
			return AlertCircle;
		case 'training':
			return Loader2;
		default:
			return Clock;
	}
}

function getStatusColor(status: string) {
	switch (status) {
		case 'completed':
			return 'text-green-400';
		case 'failed':
			return 'text-red-400';
		case 'training':
			return 'text-yellow-400';
		default:
			return 'text-zinc-400';
	}
}

function formatDate(date: Date) {
	return new Intl.DateTimeFormat('en-US', {
		month: 'short',
		day: 'numeric',
		hour: 'numeric',
		minute: '2-digit',
	}).format(new Date(date));
}
</script>

<div class="min-h-screen bg-zinc-950">
	<header class="border-b border-zinc-800">
		<div class="max-w-7xl mx-auto px-4 py-4 flex items-center justify-between">
			<div class="flex items-center gap-6">
				<a href="/" class="text-xl font-bold text-white hover:text-yellow-400 transition-colors">Zephyr</a>
				<nav class="flex items-center gap-4">
					<a href="/app" class="text-sm text-zinc-400 hover:text-white transition-colors">Generate</a>
					<a href="/app/train" class="text-sm text-white font-medium">Train</a>
				</nav>
			</div>
			<div class="flex items-center gap-4">
				<a
					href="/app/billing"
					class="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 rounded-lg transition-colors"
					title="Monthly: {tokens}, Bonus: {bonusTokens}"
				>
					<Coins class="w-4 h-4 text-yellow-500" />
					<span class="text-sm font-medium text-white">{tokens + bonusTokens}</span>
				</a>
				<div class="relative">
					<button
						onclick={() => (settingsOpen = !settingsOpen)}
						class="p-2 text-zinc-400 hover:text-white transition-colors"
					>
						<Settings class="w-5 h-5" />
					</button>
					{#if settingsOpen}
						<div class="absolute right-0 top-full mt-2 w-72 bg-zinc-900 border border-zinc-800 rounded-lg shadow-xl z-50">
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
											? 'bg-yellow-500'
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
			<!-- Main content -->
			<div class="lg:col-span-8">
				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
					{#if activeJob}
						<TrainingWizard
							job={activeJob}
							images={activeImages}
							{tokens}
							{bonusTokens}
							onjobupdate={handleJobUpdate}
							onimagesupdate={handleImagesUpdate}
							onloracreated={handleLoraCreated}
							ontokensupdate={handleTokensUpdate}
						/>
					{:else}
						<div class="text-center py-12">
							<h2 class="text-xl font-medium text-white mb-2">Train a Custom LoRA</h2>
							<p class="text-sm text-zinc-400 mb-6 max-w-md mx-auto">
								Upload images, auto-caption them with AI, and train your own LoRA model.
								Use it to generate images with your own subjects or styles.
							</p>
							<button
								onclick={() => (showNewJobModal = true)}
								class="inline-flex items-center gap-2 px-6 py-3 bg-yellow-500 hover:bg-yellow-400 text-zinc-900 font-medium rounded-lg transition-colors"
							>
								<Plus class="w-5 h-5" />
								Start Training
							</button>
						</div>
					{/if}
				</div>
			</div>

			<!-- Sidebar -->
			<div class="lg:col-span-4">
				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6 sticky top-8 space-y-4">
					<div class="flex items-center justify-between">
						<h3 class="text-sm font-medium text-zinc-300">Training Jobs</h3>
						<button
							onclick={() => (showNewJobModal = true)}
							class="p-1 text-zinc-400 hover:text-white transition-colors"
						>
							<Plus class="w-4 h-4" />
						</button>
					</div>

					{#if jobs.length > 0}
						<div class="space-y-2">
							{#each jobs as job}
								{@const Icon = getStatusIcon(job.status)}
								<div
									class="group flex items-center gap-3 p-3 rounded-lg border transition-colors cursor-pointer {activeJob?.id === job.id
										? 'bg-zinc-800 border-yellow-500/50'
										: 'bg-zinc-900 border-zinc-800 hover:border-zinc-700'}"
								>
									<button
										onclick={() => selectJob(job)}
										class="flex-1 flex items-center gap-3 text-left"
									>
										<Icon class="w-4 h-4 shrink-0 {getStatusColor(job.status)} {job.status === 'training' ? 'animate-spin' : ''}" />
										<div class="min-w-0 flex-1">
											<p class="text-sm text-zinc-200 truncate">{job.name}</p>
											<p class="text-xs text-zinc-500">{formatDate(job.createdAt)}</p>
										</div>
									</button>
									<button
										onclick={() => deleteJob(job.id)}
										class="p-1 text-zinc-500 opacity-0 group-hover:opacity-100 hover:text-red-400 transition-all"
										title={job.status === 'training' ? 'Delete stuck job' : 'Delete job'}
									>
										<Trash2 class="w-4 h-4" />
									</button>
								</div>
							{/each}
						</div>
					{:else}
						<p class="text-sm text-zinc-500 text-center py-4">
							No training jobs yet
						</p>
					{/if}
				</div>
			</div>
		</div>
	</main>
</div>

<!-- New Job Modal -->
{#if showNewJobModal}
	<div class="fixed inset-0 bg-black/60 flex items-center justify-center z-50">
		<div class="bg-zinc-900 border border-zinc-800 rounded-xl p-6 w-full max-w-md mx-4">
			<div class="flex items-center justify-between mb-4">
				<h3 class="text-lg font-medium text-white">New Training Job</h3>
				<button
					onclick={() => (showNewJobModal = false)}
					class="text-zinc-400 hover:text-white"
				>
					<X class="w-5 h-5" />
				</button>
			</div>
			<div class="space-y-4">
				<div>
					<label for="jobName" class="block text-sm font-medium text-zinc-300 mb-2">
						LoRA Name
					</label>
					<input
						id="jobName"
						type="text"
						bind:value={newJobName}
						placeholder="My Custom LoRA"
						class="w-full px-4 py-2 bg-zinc-800 border border-zinc-700 rounded-lg text-white placeholder-zinc-500 focus:outline-none focus:border-yellow-500"
					/>
					<p class="text-xs text-zinc-500 mt-1">
						This will be the name of your LoRA in your library
					</p>
				</div>
				<div class="flex gap-3">
					<button
						onclick={() => (showNewJobModal = false)}
						class="flex-1 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 font-medium rounded-lg transition-colors"
					>
						Cancel
					</button>
					<button
						onclick={createNewJob}
						disabled={!newJobName.trim() || creatingJob}
						class="flex-1 px-4 py-2 bg-yellow-500 hover:bg-yellow-400 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 font-medium rounded-lg transition-colors"
					>
						{creatingJob ? 'Creating...' : 'Create'}
					</button>
				</div>
			</div>
		</div>
	</div>
{/if}
