<script lang="ts">
import {
	ArrowLeft,
	Check,
	Clock,
	Coins,
	CreditCard,
	ExternalLink,
	Package,
	Sparkles,
	XCircle,
} from 'lucide-svelte';
import { PRICING } from '$lib/pricing';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let purchasing = $state<string | null>(null);
let error = $state<string | null>(null);

async function upgradeToPro() {
	purchasing = 'pro';
	error = null;
	try {
		const res = await fetch('/api/billing/checkout', { method: 'POST' });
		const data = await res.json();
		if (data.url) {
			window.location.href = data.url;
		} else {
			error = data.message || 'Failed to create checkout';
		}
	} catch {
		error = 'Failed to create checkout';
	} finally {
		purchasing = null;
	}
}

async function buyCredits(pack: 'credits_100' | 'credits_500' | 'credits_1000') {
	purchasing = pack;
	error = null;
	try {
		const res = await fetch('/api/billing/buy-credits', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ pack }),
		});
		const data = await res.json();
		if (data.url) {
			window.location.href = data.url;
		} else {
			error = data.message || 'Failed to create checkout';
		}
	} catch {
		error = 'Failed to create checkout';
	} finally {
		purchasing = null;
	}
}

function formatDate(date: Date | string) {
	return new Date(date).toLocaleDateString('en-US', {
		year: 'numeric',
		month: 'short',
		day: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function getStatusColor(status: string) {
	switch (status) {
		case 'completed':
			return 'text-green-400 bg-green-400/10';
		case 'confirmed':
			return 'text-blue-400 bg-blue-400/10';
		case 'pending':
			return 'text-yellow-400 bg-yellow-400/10';
		case 'failed':
		case 'expired':
			return 'text-red-400 bg-red-400/10';
		default:
			return 'text-zinc-400 bg-zinc-400/10';
	}
}

function getStatusIcon(status: string) {
	switch (status) {
		case 'completed':
		case 'confirmed':
			return Check;
		case 'pending':
			return Clock;
		case 'failed':
		case 'expired':
			return XCircle;
		default:
			return Clock;
	}
}

const currentTier = data.subscription?.tier || 'free';
const isPro = currentTier === 'pro' && data.subscription?.status === 'active';
</script>

<div class="min-h-screen bg-zinc-950">
	<header class="border-b border-zinc-800">
		<div class="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
			<a href="/app" class="p-2 text-zinc-400 hover:text-white transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<h1 class="text-xl font-bold text-white">Billing</h1>
		</div>
	</header>

	<main class="max-w-4xl mx-auto px-4 py-8 space-y-8">
		{#if error}
			<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
				{error}
			</div>
		{/if}

		<!-- Current Plan & Balance -->
		<div class="grid md:grid-cols-2 gap-6">
			<!-- Current Plan -->
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
						<Sparkles class="w-5 h-5 text-yellow-400" />
					</div>
					<div>
						<h2 class="text-lg font-semibold text-white">Current Plan</h2>
						<p class="text-sm text-zinc-400">
							{isPro ? 'Pro' : 'Free'} tier
						</p>
					</div>
				</div>

				{#if isPro}
					<div class="space-y-2 text-sm">
						<div class="flex justify-between">
							<span class="text-zinc-400">Monthly tokens</span>
							<span class="text-white">{PRICING.tiers.pro.monthlyTokens}</span>
						</div>
						{#if data.subscription?.currentPeriodEnd}
							<div class="flex justify-between">
								<span class="text-zinc-400">Renews</span>
								<span class="text-white">{formatDate(data.subscription.currentPeriodEnd)}</span>
							</div>
						{/if}
					</div>
				{:else}
					<div class="space-y-3">
						<p class="text-sm text-zinc-400">
							{PRICING.tiers.free.monthlyTokens} tokens/month
						</p>
						<button
							onclick={upgradeToPro}
							disabled={purchasing === 'pro'}
							class="w-full py-2.5 px-4 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 disabled:opacity-50 text-zinc-900 font-medium rounded-lg transition-all text-sm"
						>
							{purchasing === 'pro' ? 'Loading...' : `Upgrade to Pro - $${PRICING.tiers.pro.price}/mo`}
						</button>
					</div>
				{/if}
			</div>

			<!-- Token Balance -->
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
				<div class="flex items-center gap-3 mb-4">
					<div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
						<Coins class="w-5 h-5 text-amber-400" />
					</div>
					<div>
						<h2 class="text-lg font-semibold text-white">Token Balance</h2>
						<p class="text-sm text-zinc-400">Available tokens</p>
					</div>
				</div>

				<div class="space-y-3">
					<div class="flex items-baseline gap-2">
						<span class="text-3xl font-bold text-white">{data.user.tokens + data.user.bonusTokens}</span>
						<span class="text-zinc-400">tokens</span>
					</div>
					<div class="flex gap-4 text-sm">
						<div>
							<span class="text-zinc-500">Monthly:</span>
							<span class="text-zinc-300 ml-1">{data.user.tokens}</span>
						</div>
						<div>
							<span class="text-zinc-500">Bonus:</span>
							<span class="text-zinc-300 ml-1">{data.user.bonusTokens}</span>
						</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Buy Credits -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<div class="flex items-center gap-3 mb-6">
				<div class="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
					<Package class="w-5 h-5 text-green-400" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-white">Buy Token Packs</h2>
					<p class="text-sm text-zinc-400">One-time purchase, tokens never expire</p>
				</div>
			</div>

			<div class="grid sm:grid-cols-3 gap-4">
				{#each Object.entries(PRICING.creditPacks) as [key, pack]}
					<button
						onclick={() => buyCredits(key as 'credits_100' | 'credits_500' | 'credits_1000')}
						disabled={purchasing === key}
						class="p-4 border border-zinc-700 hover:border-zinc-600 rounded-xl text-left transition-colors disabled:opacity-50 group"
					>
						<div class="text-2xl font-bold text-white mb-1">{pack.tokens}</div>
						<div class="text-sm text-zinc-400 mb-3">tokens</div>
						<div class="text-lg font-semibold text-yellow-400 group-hover:text-yellow-300">
							{purchasing === key ? 'Loading...' : `$${pack.price}`}
						</div>
					</button>
				{/each}
			</div>

			<p class="mt-4 text-xs text-zinc-500">
				Pay with crypto (USDT, USDC, LTC, DOGE, SOL, and more)
			</p>
		</div>

		<!-- Transaction History -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<div class="flex items-center gap-3 mb-6">
				<div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
					<CreditCard class="w-5 h-5 text-blue-400" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-white">Transaction History</h2>
					<p class="text-sm text-zinc-400">Your past orders and payments</p>
				</div>
			</div>

			{#if data.transactions.length === 0}
				<div class="text-center py-8">
					<p class="text-zinc-500">No transactions yet</p>
				</div>
			{:else}
				<div class="space-y-3">
					{#each data.transactions as tx}
						{@const StatusIcon = getStatusIcon(tx.status)}
						<div class="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
							<div class="flex items-center gap-4">
								<div class="w-10 h-10 rounded-lg bg-zinc-700/50 flex items-center justify-center">
									{#if tx.type === 'subscription'}
										<Sparkles class="w-5 h-5 text-yellow-400" />
									{:else}
										<Package class="w-5 h-5 text-green-400" />
									{/if}
								</div>
								<div>
									<div class="font-medium text-white">
										{tx.type === 'subscription' ? 'Pro Subscription' : `${tx.tokensGranted} Tokens`}
									</div>
									<div class="text-sm text-zinc-500">
										{formatDate(tx.createdAt)}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-4">
								<div class="text-right">
									<div class="font-medium text-white">
										${(tx.amount / 100).toFixed(2)}
									</div>
									{#if tx.payCurrency}
										<div class="text-xs text-zinc-500 uppercase">
											{tx.payAmount} {tx.payCurrency}
										</div>
									{/if}
								</div>
								<div class="flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium {getStatusColor(tx.status)}">
									<StatusIcon class="w-3.5 h-3.5" />
									{tx.status}
								</div>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</div>

		<!-- Help -->
		<div class="text-center text-sm text-zinc-500">
			<p>Need help? Use the chat widget in the bottom right corner.</p>
		</div>
	</main>
</div>
