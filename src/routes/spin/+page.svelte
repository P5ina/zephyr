<script lang="ts">
import { browser } from '$app/environment';
import {
	ArrowRight,
	Check,
	Download,
	Gift,
	Loader2,
	Play,
	Share2,
	Sparkles,
	Upload,
	X,
} from 'lucide-svelte';
import Footer from '$lib/components/Footer.svelte';
import Header from '$lib/components/Header.svelte';
import { PRICING } from '$lib/pricing';
import type { SpinJob } from '$lib/server/db/schema';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const TOKEN_COST = PRICING.tokenCosts.spin;

// svelte-ignore state_referenced_locally
const initialSpinJobs = data.spinJobs;
// svelte-ignore state_referenced_locally
const initialTokens = data.user?.tokens ?? 0;
// svelte-ignore state_referenced_locally
const initialBonusTokens = data.user?.bonusTokens ?? 0;
// svelte-ignore state_referenced_locally
const initialGenerationsRemaining = data.guestInfo?.generationsRemaining ?? 3;

// Find any pending/processing job to resume
const pendingJob = initialSpinJobs.find((j) => j.status === 'pending' || j.status === 'processing');

// State
let uploadedFile = $state<File | null>(null);
let uploadPreviewUrl = $state<string | null>(null);
let generating = $state(!!pendingJob);
let currentJobId = $state<string | null>(pendingJob?.id ?? null);
let spinJobs = $state<SpinJob[]>(initialSpinJobs);

// Token state for logged-in users
let tokens = $state(initialTokens);
let bonusTokens = $state(initialBonusTokens);

// Guest state
let generationsRemaining = $state(initialGenerationsRemaining);

// Current job being viewed
let viewingJob = $state<SpinJob | null>(
	initialSpinJobs.find((j) => j.status === 'completed') || null,
);

// Track polling
const pollingSet = new Set<string>();

// Clean up preview URL when file changes
$effect(() => {
	if (uploadedFile) {
		const url = URL.createObjectURL(uploadedFile);
		uploadPreviewUrl = url;
		return () => URL.revokeObjectURL(url);
	} else {
		uploadPreviewUrl = null;
	}
});

// Start polling for pending jobs (only on client)
$effect(() => {
	if (!browser) return;

	for (const job of spinJobs) {
		if (
			(job.status === 'pending' || job.status === 'processing') &&
			!pollingSet.has(job.id)
		) {
			pollingSet.add(job.id);
			pollJobStatus(job.id);
		}
	}
});

function handleFileSelect(event: Event) {
	const input = event.target as HTMLInputElement;
	const file = input.files?.[0];
	if (file) {
		uploadedFile = file;
	}
}

function handleDrop(event: DragEvent) {
	event.preventDefault();
	const file = event.dataTransfer?.files[0];
	if (file?.type.startsWith('image/')) {
		uploadedFile = file;
	}
}

function handleDragOver(event: DragEvent) {
	event.preventDefault();
}

function clearSelection() {
	uploadedFile = null;
}

async function generate() {
	if (!uploadedFile || generating) return;

	// Check if user can generate
	if (!data.user && generationsRemaining <= 0) {
		alert('Free generation limit reached. Sign up to continue!');
		return;
	}

	if (data.user && tokens + bonusTokens < TOKEN_COST) {
		alert('Not enough tokens. Please purchase more.');
		return;
	}

	generating = true;

	try {
		const formData = new FormData();
		formData.append('image', uploadedFile);

		const res = await fetch('/api/spin/generate', {
			method: 'POST',
			body: formData,
		});

		if (!res.ok) {
			const error = await res.json();
			alert(error.message || 'Failed to generate');
			generating = false;
			return;
		}

		const result = await res.json();

		// Update tokens or guest remaining
		if (result.isGuest) {
			generationsRemaining = result.generationsRemaining ?? generationsRemaining - 1;
		} else {
			tokens = result.tokensRemaining ?? tokens;
			bonusTokens = result.bonusTokensRemaining ?? bonusTokens;
		}

		if (result.job) {
			spinJobs = [result.job, ...spinJobs];
			currentJobId = result.job.id;
			pollingSet.add(result.job.id);
			clearSelection();
			pollJobStatus(result.job.id);
		}
	} catch (e) {
		console.error('Generation error:', e);
		alert('Failed to generate spin video');
		generating = false;
	}
}

async function pollJobStatus(id: string) {
	let retryCount = 0;
	const maxRetries = 5;

	const poll = async (): Promise<void> => {
		try {
			const res = await fetch(`/api/spin/${id}/status`);
			if (!res.ok) {
				retryCount++;
				if (retryCount < maxRetries) {
					await new Promise((r) => setTimeout(r, 2000));
					return poll();
				}
				pollingSet.delete(id);
				if (currentJobId === id) {
					generating = false;
					currentJobId = null;
				}
				return;
			}

			retryCount = 0;
			const result = await res.json();

			spinJobs = spinJobs.map((j) =>
				j.id === id
					? {
							...j,
							status: result.status,
							progress: result.progress,
							currentStage: result.statusMessage,
							videoUrl: result.videoUrl,
							inputImageUrl: result.inputImageUrl ?? j.inputImageUrl,
						}
					: j,
			);

			if (result.status === 'completed' || result.status === 'failed') {
				pollingSet.delete(id);
				if (currentJobId === id) {
					generating = false;
					currentJobId = null;
				}

				// Auto-select completed job for viewing
				if (result.status === 'completed') {
					const completedJob = spinJobs.find((j) => j.id === id);
					if (completedJob) {
						viewingJob = completedJob;
					}
				}

				if (result.status === 'failed' && result.error) {
					alert(result.error);
				}
				return;
			}

			await new Promise((r) => setTimeout(r, 2000));
			return poll();
		} catch {
			retryCount++;
			if (retryCount < maxRetries) {
				await new Promise((r) => setTimeout(r, 2000));
				return poll();
			}
			pollingSet.delete(id);
			if (currentJobId === id) {
				generating = false;
				currentJobId = null;
			}
		}
	};
	await poll();
}

function downloadVideo() {
	if (!viewingJob?.videoUrl) return;

	const a = document.createElement('a');
	a.href = viewingJob.videoUrl;
	a.download = `oiia-spin-${viewingJob.id}.mp4`;
	a.click();
}

async function shareVideo() {
	if (!viewingJob?.videoUrl) return;

	if (navigator.share) {
		try {
			await navigator.share({
				title: 'OIIA OIIA Spin',
				text: 'Check out my spinning video!',
				url: viewingJob.videoUrl,
			});
		} catch {
			// User cancelled or error
		}
	} else {
		// Fallback: copy to clipboard
		await navigator.clipboard.writeText(viewingJob.videoUrl);
		alert('Video URL copied to clipboard!');
	}
}

async function cancelJob(id: string) {
	if (!confirm('Cancel this generation?')) return;

	try {
		const res = await fetch(`/api/spin/${id}/cancel`, { method: 'POST' });
		if (res.ok) {
			const result = await res.json();
			spinJobs = spinJobs.map((j) =>
				j.id === id ? { ...j, status: 'failed', errorMessage: 'Cancelled' } : j,
			);
			pollingSet.delete(id);
			if (currentJobId === id) {
				generating = false;
				currentJobId = null;
			}
			// Refund tokens
			if (result.regularTokensRefunded || result.bonusTokensRefunded) {
				tokens = tokens + (result.regularTokensRefunded ?? 0);
				bonusTokens = bonusTokens + (result.bonusTokensRefunded ?? 0);
			}
		}
	} catch {
		alert('Failed to cancel');
	}
}

// Get current generating job
const currentJob = $derived(
	currentJobId ? spinJobs.find((j) => j.id === currentJobId) : null,
);

const canGenerate = $derived(
	uploadedFile &&
		!generating &&
		(data.user ? tokens + bonusTokens >= TOKEN_COST : generationsRemaining > 0),
);

const title = 'OIIA OIIA Spin Generator | GenSprite';
const description = 'Create funny spinning OIIA OIIA videos from any image. Free to try!';
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
</svelte:head>

<div class="min-h-screen bg-zinc-950 flex flex-col">
	<!-- Animated background -->
	<div class="fixed inset-0 overflow-hidden pointer-events-none">
		<div class="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-purple-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse"></div>
		<div class="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-pink-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
	</div>

	<Header user={data.user} variant="simple" showAuth={true} ctaText="Get More Spins" ctaHref="/app/billing" />

	<main class="relative z-10 flex-1">
		<div class="max-w-4xl mx-auto px-4 py-12">
			<!-- Hero -->
			<div class="text-center mb-12">
				<h1 class="text-4xl md:text-5xl font-bold text-white mb-4">
					OIIA OIIA
					<span class="bg-linear-to-r from-purple-400 via-pink-400 to-red-400 bg-clip-text text-transparent"> Spin Generator</span>
				</h1>
				<p class="text-lg text-zinc-400 max-w-xl mx-auto">
					Upload any front-facing image and create a hilarious spinning video with the iconic OIIA OIIA sound.
				</p>
			</div>

			<!-- Free generation badge -->
			{#if !data.user}
				<div class="flex justify-center mb-8">
					<div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-gradient-to-r from-purple-500/20 to-pink-500/20 border border-purple-500/30">
						<Gift class="w-4 h-4 text-purple-400" />
						<span class="text-sm text-purple-300 font-medium">
							{generationsRemaining} free spin{generationsRemaining !== 1 ? 's' : ''} remaining
						</span>
					</div>
				</div>
			{:else}
				<div class="flex justify-center mb-8">
					<div class="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-zinc-800/50 border border-zinc-700">
						<Sparkles class="w-4 h-4 text-yellow-400" />
						<span class="text-sm text-zinc-300">
							{tokens + bonusTokens} tokens available
						</span>
					</div>
				</div>
			{/if}

			<!-- Main content -->
			<div class="grid md:grid-cols-2 gap-8">
				<!-- Left: Upload & Generate -->
				<div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
					<h2 class="text-lg font-semibold text-white mb-4">Upload Image</h2>

					{#if uploadPreviewUrl}
						<div class="relative aspect-square bg-zinc-800/50 rounded-xl border border-zinc-700 overflow-hidden mb-4">
							<img
								src={uploadPreviewUrl}
								alt="Preview"
								class="w-full h-full object-contain"
							/>
							<button
								onclick={clearSelection}
								class="absolute top-2 right-2 p-1.5 bg-black/60 hover:bg-black/80 rounded-lg transition-colors"
							>
								<X class="w-4 h-4 text-white" />
							</button>
						</div>
					{:else}
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div
							ondrop={handleDrop}
							ondragover={handleDragOver}
							role="button"
							tabindex="0"
							class="relative aspect-square bg-zinc-800/30 border-2 border-dashed border-zinc-700 hover:border-purple-500/50 rounded-xl flex flex-col items-center justify-center cursor-pointer transition-colors mb-4"
						>
							<input
								type="file"
								accept="image/png,image/jpeg,image/webp"
								onchange={handleFileSelect}
								class="absolute inset-0 opacity-0 cursor-pointer"
								id="file-input"
							/>
							<label for="file-input" class="flex flex-col items-center cursor-pointer p-8">
								<Upload class="w-12 h-12 text-zinc-500 mb-4" />
								<p class="text-sm text-zinc-400 text-center mb-2">
									Drag & drop or click to upload
								</p>
								<p class="text-xs text-zinc-500">Front-facing image works best</p>
							</label>
						</div>
					{/if}

					<!-- Generate button -->
					<button
						onclick={generate}
						disabled={!canGenerate}
						class="w-full py-3.5 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 disabled:from-zinc-700 disabled:to-zinc-700 disabled:cursor-not-allowed text-white disabled:text-zinc-400 font-semibold rounded-xl transition-all flex items-center justify-center gap-2"
					>
						{#if generating}
							<Loader2 class="w-5 h-5 animate-spin" />
							{currentJob?.currentStage || 'Generating...'}
						{:else}
							<Play class="w-5 h-5" />
							{#if data.user}
								Generate Spin ({TOKEN_COST} tokens)
							{:else}
								Generate Free Spin
							{/if}
						{/if}
					</button>

					{#if generating && currentJob}
						<div class="mt-4">
							<div class="flex items-center justify-between text-xs text-zinc-500 mb-2">
								<span>{currentJob.currentStage || 'Processing...'}</span>
								<span>{currentJob.progress || 0}%</span>
							</div>
							<div class="h-2 bg-zinc-800 rounded-full overflow-hidden">
								<div
									class="h-full bg-gradient-to-r from-purple-500 to-pink-500 transition-all duration-300"
									style="width: {currentJob.progress || 0}%"
								></div>
							</div>
							<button
								onclick={() => currentJob && cancelJob(currentJob.id)}
								class="mt-3 w-full py-2 text-sm text-red-400 hover:text-red-300 transition-colors"
							>
								Cancel
							</button>
						</div>
					{/if}

					<!-- Tips -->
					<div class="mt-6 pt-6 border-t border-zinc-800">
						<p class="text-xs text-zinc-500 mb-2">Tips for best results:</p>
						<ul class="text-xs text-zinc-500 space-y-1">
							<li>Use a front-facing character or object</li>
							<li>Clean background works best</li>
							<li>Square images recommended</li>
						</ul>
					</div>
				</div>

				<!-- Right: Result -->
				<div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6">
					<h2 class="text-lg font-semibold text-white mb-4">Your Spin Video</h2>

					{#if viewingJob?.videoUrl}
						<div class="aspect-square bg-zinc-800/50 rounded-xl overflow-hidden mb-4">
							<!-- svelte-ignore a11y_media_has_caption -->
							<video
								src={viewingJob.videoUrl}
								class="w-full h-full object-contain"
								controls
								autoplay
								loop
								playsinline
							></video>
						</div>

						<!-- Actions -->
						<div class="flex gap-3">
							<button
								onclick={downloadVideo}
								class="flex-1 py-2.5 bg-purple-500 hover:bg-purple-400 text-white font-medium rounded-xl transition-colors flex items-center justify-center gap-2"
							>
								<Download class="w-4 h-4" />
								Download
							</button>
							<button
								onclick={shareVideo}
								class="px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white rounded-xl transition-colors"
							>
								<Share2 class="w-4 h-4" />
							</button>
						</div>
					{:else if generating}
						<div class="aspect-square bg-zinc-800/30 rounded-xl border border-zinc-700 flex flex-col items-center justify-center">
							<div class="relative">
								<div class="w-16 h-16 rounded-full border-4 border-purple-500/30 border-t-purple-500 animate-spin"></div>
								<Sparkles class="absolute inset-0 m-auto w-6 h-6 text-purple-400" />
							</div>
							<p class="mt-4 text-sm text-zinc-400">Creating your spin...</p>
						</div>
					{:else}
						<div class="aspect-square bg-zinc-800/30 rounded-xl border border-zinc-700 flex flex-col items-center justify-center">
							<Play class="w-12 h-12 text-zinc-600 mb-3" />
							<p class="text-sm text-zinc-500">Your video will appear here</p>
						</div>
					{/if}

					<!-- Previous spins -->
					{#if spinJobs.length > 1 || (spinJobs.length === 1 && spinJobs[0].id !== viewingJob?.id)}
						<div class="mt-6 pt-6 border-t border-zinc-800">
							<p class="text-xs text-zinc-500 mb-3">Previous spins</p>
							<div class="flex gap-2 overflow-x-auto pb-2">
								{#each spinJobs.filter((j) => j.status === 'completed' && j.id !== viewingJob?.id) as job (job.id)}
									<button
										onclick={() => viewingJob = job}
										class="flex-shrink-0 w-14 h-14 rounded-lg overflow-hidden border-2 border-zinc-700 hover:border-purple-500/50 transition-colors"
									>
										{#if job.inputImageUrl}
											<img
												src={job.inputImageUrl}
												alt="Previous spin"
												class="w-full h-full object-cover"
											/>
										{:else}
											<div class="w-full h-full bg-zinc-800 flex items-center justify-center">
												<Check class="w-4 h-4 text-green-400" />
											</div>
										{/if}
									</button>
								{/each}
							</div>
						</div>
					{/if}
				</div>
			</div>

			<!-- CTA for guests -->
			{#if !data.user}
				<div class="mt-12 p-6 rounded-2xl bg-gradient-to-r from-purple-500/10 to-pink-500/10 border border-purple-500/30 text-center">
					<h3 class="text-xl font-bold text-white mb-2">Want more spins?</h3>
					<p class="text-zinc-400 text-sm mb-4">
						Sign up to get 50 free tokens and access to all GenSprite features!
					</p>
					<a
						href="/login"
						class="inline-flex items-center gap-2 px-6 py-3 bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-400 hover:to-pink-400 text-white font-semibold rounded-xl transition-all"
					>
						Sign up free
						<ArrowRight class="w-4 h-4" />
					</a>
				</div>
			{/if}
		</div>
	</main>

	<Footer />
</div>
