<script lang="ts">
import {
	ArrowLeft,
	Check,
	Clock,
	Coins,
	CreditCard,
	Layers,
	Package,
	RotateCw,
	Sparkles,
	XCircle,
} from 'lucide-svelte';
import { PRICING } from '$lib/pricing';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let purchasing = $state<string | null>(null);
let error = $state<string | null>(null);

async function buyCredits(pack: keyof typeof PRICING.creditPacks) {
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

function getPerTokenPrice(price: number, tokens: number) {
	return (price / tokens).toFixed(4);
}

function getDiscount(pack: (typeof PRICING.creditPacks)[keyof typeof PRICING.creditPacks]) {
	const baseRate = PRICING.creditPacks.starter.price / PRICING.creditPacks.starter.tokens;
	const packRate = pack.price / pack.tokens;
	const discount = Math.round((1 - packRate / baseRate) * 100);
	return discount > 0 ? discount : 0;
}
</script>

<div class="min-h-screen bg-zinc-950">
	<header class="border-b border-zinc-800">
		<div class="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
			<a href="/app" class="p-2 text-zinc-400 hover:text-white transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<h1 class="text-xl font-bold text-white">Buy Tokens</h1>
		</div>
	</header>

	<main class="max-w-4xl mx-auto px-4 py-8 space-y-8">
		{#if error}
			<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
				{error}
			</div>
		{/if}

		<!-- Token Balance -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<div class="flex items-center gap-3 mb-4">
				<div class="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center">
					<Coins class="w-5 h-5 text-yellow-400" />
				</div>
				<div>
					<h2 class="text-lg font-semibold text-white">Your Balance</h2>
					<p class="text-sm text-zinc-400">Tokens available to spend</p>
				</div>
			</div>

			<div class="flex items-baseline gap-2">
				<span class="text-4xl font-bold text-white">{data.user.tokens + data.user.bonusTokens}</span>
				<span class="text-zinc-400">tokens</span>
			</div>
		</div>

		<!-- Token Packs -->
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
					{@const discount = getDiscount(pack)}
					<button
						onclick={() => buyCredits(key as keyof typeof PRICING.creditPacks)}
						disabled={purchasing === key}
						class="relative p-5 border rounded-xl text-left transition-all disabled:opacity-50 group {pack.popular
							? 'border-yellow-500/50 bg-yellow-500/5 hover:border-yellow-500'
							: 'border-zinc-700 hover:border-zinc-600'}"
					>
						{#if pack.popular}
							<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full text-xs font-medium text-zinc-900">
								Best Value
							</div>
						{/if}
						<div class="text-sm font-medium text-zinc-400 mb-1">{pack.name}</div>
						<div class="text-2xl font-bold text-white mb-1">{pack.tokens.toLocaleString()}</div>
						<div class="text-sm text-zinc-500 mb-3">tokens</div>
						<div class="flex items-baseline gap-2">
							<span class="text-xl font-bold {pack.popular ? 'text-yellow-400' : 'text-white'}">
								{purchasing === key ? '...' : `$${pack.price}`}
							</span>
							{#if discount > 0}
								<span class="text-xs text-green-400 font-medium">{discount}% off</span>
							{/if}
						</div>
						<div class="text-xs text-zinc-500 mt-1">
							${getPerTokenPrice(pack.price, pack.tokens)} per token
						</div>
					</button>
				{/each}
			</div>

			<p class="mt-4 text-xs text-zinc-500 text-center">
				Pay with crypto (USDT, USDC, LTC, DOGE, SOL, and more)
			</p>
		</div>

		<!-- Token Costs Reference -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
			<h3 class="text-sm font-medium text-zinc-400 mb-4">Token costs</h3>
			<div class="grid grid-cols-3 gap-4">
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-lg bg-yellow-500/10 flex items-center justify-center">
						<Sparkles class="w-4 h-4 text-yellow-400" />
					</div>
					<div>
						<div class="text-sm text-white font-medium">Sprite</div>
						<div class="text-xs text-zinc-500">{PRICING.tokenCosts.sprite} tokens</div>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-lg bg-orange-500/10 flex items-center justify-center">
						<Layers class="w-4 h-4 text-orange-400" />
					</div>
					<div>
						<div class="text-sm text-white font-medium">Texture</div>
						<div class="text-xs text-zinc-500">{PRICING.tokenCosts.texture} tokens</div>
					</div>
				</div>
				<div class="flex items-center gap-3">
					<div class="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
						<RotateCw class="w-4 h-4 text-amber-400" />
					</div>
					<div>
						<div class="text-sm text-white font-medium">Rotation</div>
						<div class="text-xs text-zinc-500">{PRICING.tokenCosts.rotation} tokens</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Transaction History -->
		{#if data.transactions.length > 0}
			<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-6">
				<div class="flex items-center gap-3 mb-6">
					<div class="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
						<CreditCard class="w-5 h-5 text-blue-400" />
					</div>
					<div>
						<h2 class="text-lg font-semibold text-white">Transaction History</h2>
						<p class="text-sm text-zinc-400">Your past orders</p>
					</div>
				</div>

				<div class="space-y-3">
					{#each data.transactions as tx}
						{@const StatusIcon = getStatusIcon(tx.status)}
						<div class="flex items-center justify-between p-4 bg-zinc-800/50 rounded-lg">
							<div class="flex items-center gap-4">
								<div class="w-10 h-10 rounded-lg bg-zinc-700/50 flex items-center justify-center">
									<Package class="w-5 h-5 text-green-400" />
								</div>
								<div>
									<div class="font-medium text-white">
										{tx.tokensGranted.toLocaleString()} Tokens
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
			</div>
		{/if}
	</main>
</div>
