<script lang="ts">
import { Bitcoin, Crown, Loader2, Package, Sparkles, Zap } from 'lucide-svelte';

interface BillingInfo {
	tier: 'free' | 'pro';
	tierName: string;
	status: string;
	currentPeriodEnd: string | null;
	monthlyTokens: number;
	bonusTokens: number;
	totalTokens: number;
	monthlyAllocation: number;
}

let { tokens, bonusTokens }: { tokens: number; bonusTokens: number } = $props();

let billingInfo = $state<BillingInfo | null>(null);
let loading = $state(true);
let actionLoading = $state<string | null>(null);
let error = $state<string | null>(null);

$effect(() => {
	loadBillingInfo();
});

async function loadBillingInfo() {
	loading = true;
	error = null;
	try {
		const res = await fetch('/api/billing');
		if (res.ok) {
			billingInfo = await res.json();
		} else {
			error = 'Failed to load billing info';
		}
	} catch {
		error = 'Failed to load billing info';
	} finally {
		loading = false;
	}
}

async function handleUpgrade() {
	actionLoading = 'upgrade';
	try {
		const res = await fetch('/api/billing/checkout', { method: 'POST' });
		const data = await res.json();
		if (data.url) {
			window.location.href = data.url;
		} else {
			error = data.message || 'Failed to create payment';
		}
	} catch {
		error = 'Failed to create payment';
	} finally {
		actionLoading = null;
	}
}

async function handleBuyCredits(pack: string) {
	actionLoading = pack;
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
			error = data.message || 'Failed to create payment';
		}
	} catch {
		error = 'Failed to create payment';
	} finally {
		actionLoading = null;
	}
}

const creditPacks = [
	{ id: 'credits_100', tokens: 100, price: '$5' },
	{ id: 'credits_500', tokens: 500, price: '$20' },
	{ id: 'credits_1000', tokens: 1000, price: '$35' },
];
</script>

<div class="space-y-6">
	{#if loading}
		<div class="flex items-center justify-center py-8">
			<Loader2 class="w-6 h-6 text-zinc-400 animate-spin" />
		</div>
	{:else if error}
		<div class="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm">
			{error}
		</div>
	{:else if billingInfo}
		<!-- Current Plan -->
		<div class="p-4 bg-zinc-800/50 rounded-lg border border-zinc-700">
			<div class="flex items-center justify-between mb-4">
				<div class="flex items-center gap-2">
					{#if billingInfo.tier === 'pro'}
						<Crown class="w-5 h-5 text-yellow-400" />
					{:else}
						<Sparkles class="w-5 h-5 text-zinc-400" />
					{/if}
					<span class="font-semibold text-white">{billingInfo.tierName} Plan</span>
				</div>
				{#if billingInfo.tier === 'pro' && billingInfo.status === 'active'}
					<span class="px-2 py-0.5 text-xs font-medium bg-green-500/20 text-green-400 rounded-full">
						Active
					</span>
				{:else if billingInfo.status === 'past_due'}
					<span class="px-2 py-0.5 text-xs font-medium bg-red-500/20 text-red-400 rounded-full">
						Past Due
					</span>
				{/if}
			</div>

			<div class="space-y-2 text-sm">
				<div class="flex justify-between text-zinc-400">
					<span>Monthly tokens</span>
					<span class="text-white">{tokens} / {billingInfo.monthlyAllocation}</span>
				</div>
				{#if bonusTokens > 0}
					<div class="flex justify-between text-zinc-400">
						<span>Bonus tokens</span>
						<span class="text-yellow-400">{bonusTokens}</span>
					</div>
				{/if}
				<div class="flex justify-between text-zinc-400 pt-2 border-t border-zinc-700">
					<span>Total available</span>
					<span class="text-white font-medium">{tokens + bonusTokens}</span>
				</div>
			</div>

			{#if billingInfo.tier === 'pro' && billingInfo.currentPeriodEnd}
				<p class="mt-3 text-xs text-zinc-500">
					Expires {new Date(billingInfo.currentPeriodEnd).toLocaleDateString()}
				</p>
			{/if}
		</div>

		<!-- Upgrade to Pro -->
		{#if billingInfo.tier === 'free'}
			<div class="p-4 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-lg border border-yellow-500/20">
				<div class="flex items-center gap-2 mb-2">
					<Zap class="w-5 h-5 text-yellow-400" />
					<span class="font-semibold text-white">Upgrade to Pro</span>
				</div>
				<p class="text-sm text-zinc-400 mb-4">
					Get 1,000 tokens/month, priority queue, and unlimited LoRA uploads.
				</p>
				<button
					onclick={handleUpgrade}
					disabled={actionLoading === 'upgrade'}
					class="w-full py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
				>
					{#if actionLoading === 'upgrade'}
						<Loader2 class="w-4 h-4 animate-spin" />
					{:else}
						<Bitcoin class="w-4 h-4" />
					{/if}
					Pay $9 with Crypto
				</button>
			</div>
		{:else}
			<!-- Renew Pro -->
			<div class="p-4 bg-gradient-to-br from-yellow-500/10 to-amber-500/10 rounded-lg border border-yellow-500/20">
				<div class="flex items-center gap-2 mb-2">
					<Zap class="w-5 h-5 text-yellow-400" />
					<span class="font-semibold text-white">Renew Pro</span>
				</div>
				<p class="text-sm text-zinc-400 mb-4">
					Extend your Pro subscription for another month.
				</p>
				<button
					onclick={handleUpgrade}
					disabled={actionLoading === 'upgrade'}
					class="w-full py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-medium rounded-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2"
				>
					{#if actionLoading === 'upgrade'}
						<Loader2 class="w-4 h-4 animate-spin" />
					{:else}
						<Bitcoin class="w-4 h-4" />
					{/if}
					Pay $9 with Crypto
				</button>
			</div>
		{/if}

		<!-- Buy Credit Packs -->
		<div>
			<div class="flex items-center gap-2 mb-3">
				<Package class="w-4 h-4 text-zinc-400" />
				<span class="text-sm font-medium text-zinc-300">Buy Token Packs</span>
			</div>
			<p class="text-xs text-zinc-500 mb-3">One-time purchase with crypto. Tokens never expire.</p>
			<div class="grid grid-cols-3 gap-2">
				{#each creditPacks as pack}
					<button
						onclick={() => handleBuyCredits(pack.id)}
						disabled={actionLoading === pack.id}
						class="p-3 bg-zinc-800/50 hover:bg-zinc-800 border border-zinc-700 hover:border-zinc-600 rounded-lg transition-colors disabled:opacity-50 text-center"
					>
						{#if actionLoading === pack.id}
							<Loader2 class="w-4 h-4 animate-spin mx-auto mb-1" />
						{:else}
							<div class="text-lg font-semibold text-white">{pack.tokens}</div>
							<div class="text-xs text-zinc-400">{pack.price}</div>
						{/if}
					</button>
				{/each}
			</div>
		</div>

		<!-- Crypto info -->
		<div class="flex items-start gap-2 p-3 bg-zinc-800/30 rounded-lg">
			<Bitcoin class="w-4 h-4 text-orange-400 mt-0.5 shrink-0" />
			<p class="text-xs text-zinc-400">
				Payments are processed via NowPayments. You can pay with BTC, ETH, USDT, and 100+ other cryptocurrencies.
			</p>
		</div>
	{/if}
</div>
