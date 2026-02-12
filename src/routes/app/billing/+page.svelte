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
import { track } from '@vercel/analytics';
import { PRICING } from '$lib/pricing';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let purchasing = $state<string | null>(null);
let error = $state<string | null>(null);

async function buyCredits(pack: keyof typeof PRICING.creditPacks) {
	purchasing = pack;
	error = null;

	// Track purchase initiated
	const packInfo = PRICING.creditPacks[pack];
	track('purchase_initiated', {
		pack,
		tokens: packInfo.tokens,
		price: packInfo.price
	});

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

function getDiscount(
	pack: (typeof PRICING.creditPacks)[keyof typeof PRICING.creditPacks],
) {
	const baseRate =
		PRICING.creditPacks.starter.price / PRICING.creditPacks.starter.tokens;
	const packRate = pack.price / pack.tokens;
	const discount = Math.round((1 - packRate / baseRate) * 100);
	return discount > 0 ? discount : 0;
}
</script>

<div class="billing-page">
	<!-- Page header -->
	<div class="page-header">
		<a href="/app" class="back-link">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="page-title">Buy Tokens</h1>
	</div>

	<div class="billing-content">
		{#if error}
			<div class="error-banner">
				{error}
			</div>
		{/if}

		<!-- Token Balance -->
		<div class="panel">
			<div class="flex items-center gap-3 mb-4">
				<div class="icon-badge icon-badge-amber">
					<Coins class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Your Balance</h2>
					<p class="panel-sub">Tokens available to spend</p>
				</div>
			</div>
			<div class="flex items-baseline gap-2">
				<span class="balance-number">{data.user.tokens + data.user.bonusTokens}</span>
				<span class="text-zinc-500">tokens</span>
			</div>
		</div>

		<!-- Token Packs -->
		<div class="panel">
			<div class="flex items-center gap-3 mb-6">
				<div class="icon-badge icon-badge-green">
					<Package class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Buy Token Packs</h2>
					<p class="panel-sub">One-time purchase, tokens never expire</p>
				</div>
			</div>

			<div class="packs-grid">
				{#each Object.entries(PRICING.creditPacks) as [key, pack]}
					{@const discount = getDiscount(pack)}
					<button
						onclick={() => buyCredits(key as keyof typeof PRICING.creditPacks)}
						disabled={purchasing === key}
						class="pack-card {pack.popular ? 'pack-card-pop' : ''}"
					>
						{#if pack.popular}
							<div class="pack-badge">Best Value</div>
						{/if}
						<div class="pack-name">{pack.name}</div>
						<div class="pack-tokens">{pack.tokens.toLocaleString()}</div>
						<div class="pack-tokens-label">tokens</div>
						<div class="flex items-baseline gap-2 mt-3">
							<span class="pack-price {pack.popular ? 'pack-price-gold' : ''}">
								{purchasing === key ? '...' : `$${pack.price}`}
							</span>
							{#if discount > 0}
								<span class="pack-discount">{discount}% off</span>
							{/if}
						</div>
						<div class="pack-per">
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
		<div class="panel">
			<h3 class="text-sm font-medium text-zinc-400 mb-4">Token costs</h3>
			<div class="costs-grid">
				<div class="cost-item">
					<div class="icon-badge-sm icon-badge-amber">
						<Sparkles class="w-4 h-4" />
					</div>
					<div>
						<div class="cost-name">Sprite</div>
						<div class="cost-amount">{PRICING.tokenCosts.sprite} tokens</div>
					</div>
				</div>
				<div class="cost-item">
					<div class="icon-badge-sm icon-badge-orange">
						<Layers class="w-4 h-4" />
					</div>
					<div>
						<div class="cost-name">Texture</div>
						<div class="cost-amount">{PRICING.tokenCosts.texture} tokens</div>
					</div>
				</div>
				<div class="cost-item">
					<div class="icon-badge-sm icon-badge-amber">
						<RotateCw class="w-4 h-4" />
					</div>
					<div>
						<div class="cost-name">Rotation</div>
						<div class="cost-amount">{PRICING.tokenCosts.rotation} tokens</div>
					</div>
				</div>
			</div>
		</div>

		<!-- Transaction History -->
		{#if data.transactions.length > 0}
			<div class="panel">
				<div class="flex items-center gap-3 mb-6">
					<div class="icon-badge icon-badge-blue">
						<CreditCard class="w-5 h-5" />
					</div>
					<div>
						<h2 class="panel-heading">Transaction History</h2>
						<p class="panel-sub">Your past orders</p>
					</div>
				</div>

				<div class="space-y-2">
					{#each data.transactions as tx}
						{@const StatusIcon = getStatusIcon(tx.status)}
						<div class="tx-row">
							<div class="flex items-center gap-4">
								<div class="icon-badge-sm" style="background:rgba(74,222,128,.08); color:#4ade80">
									<Package class="w-4 h-4" />
								</div>
								<div>
									<div class="text-sm font-medium text-white">
										{tx.tokensGranted.toLocaleString()} Tokens
									</div>
									<div class="text-xs text-zinc-500">
										{formatDate(tx.createdAt)}
									</div>
								</div>
							</div>
							<div class="flex items-center gap-4">
								<div class="text-right">
									<div class="text-sm font-medium text-white">
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
	</div>
</div>

<style>
	.billing-page { max-width: 52rem; margin: 0 auto; }

	/* Page header */
	.page-header {
		display: flex; align-items: center; gap: .75rem;
		margin-bottom: 1.5rem;
	}
	.back-link {
		padding: .45rem;
		color: #71717a;
		border-radius: .5rem;
		transition: color .2s, background .2s;
	}
	.back-link:hover { color: #fff; background: rgba(63,63,70,.3); }
	.page-title {
		font-weight: 800; font-size: 1.35rem; color: #fff;
	}

	/* Content */
	.billing-content { display: flex; flex-direction: column; gap: 1.5rem; }

	/* Error banner */
	.error-banner {
		padding: .85rem 1rem;
		background: rgba(239,68,68,.06);
		border: 1px solid rgba(239,68,68,.15);
		border-radius: .7rem;
		color: #f87171;
		font-size: .875rem;
	}

	/* Panels */
	.panel {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		padding: 1.5rem;
		backdrop-filter: blur(6px);
	}
	.panel-heading { font-weight: 700; font-size: 1.05rem; color: #fff; }
	.panel-sub { font-size: .8125rem; color: #71717a; }

	/* Icon badges */
	.icon-badge {
		width: 2.5rem; height: 2.5rem;
		border-radius: .6rem;
		display: flex; align-items: center; justify-content: center;
	}
	.icon-badge-sm {
		width: 2rem; height: 2rem;
		border-radius: .5rem;
		display: flex; align-items: center; justify-content: center;
	}
	.icon-badge-amber { background: rgba(245,158,11,.08); color: #fbbf24; }
	.icon-badge-green { background: rgba(74,222,128,.08); color: #4ade80; }
	.icon-badge-blue { background: rgba(96,165,250,.08); color: #60a5fa; }
	.icon-badge-orange { background: rgba(249,115,22,.08); color: #fb923c; }

	/* Balance */
	.balance-number {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800;
		font-size: 2.25rem;
		color: #fff;
	}

	/* Packs grid */
	.packs-grid {
		display: grid;
		grid-template-columns: 1fr;
		gap: 1rem;
	}
	@media (min-width: 640px) {
		.packs-grid { grid-template-columns: repeat(3, 1fr); }
	}
	.pack-card {
		position: relative;
		padding: 1.25rem;
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .85rem;
		text-align: left;
		background: none;
		cursor: pointer;
		transition: border-color .2s, box-shadow .2s, transform .15s;
		color: #fff;
	}
	.pack-card:hover:not(:disabled) {
		border-color: rgba(63,63,70,.6);
		box-shadow: 0 4px 20px rgba(0,0,0,.3);
		transform: translateY(-2px);
	}
	.pack-card:disabled { opacity: .5; cursor: not-allowed; }
	.pack-card-pop {
		border-color: rgba(245,158,11,.25);
		background: rgba(245,158,11,.03);
	}
	.pack-card-pop:hover:not(:disabled) {
		border-color: rgba(245,158,11,.4);
		box-shadow: 0 4px 24px rgba(245,158,11,.08);
	}
	.pack-badge {
		position: absolute; top: -.55rem;
		left: 50%; transform: translateX(-50%);
		padding: .15rem .65rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-size: .65rem; font-weight: 600;
		border-radius: 9999px;
	}
	.pack-name { font-size: .8125rem; color: #a1a1aa; margin-bottom: .25rem; }
	.pack-tokens {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800; font-size: 1.5rem; color: #fff;
	}
	.pack-tokens-label { font-size: .8125rem; color: #52525b; }
	.pack-price {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800; font-size: 1.2rem; color: #fff;
	}
	.pack-price-gold { color: #fbbf24; }
	.pack-discount {
		font-size: .6875rem; font-weight: 600; color: #4ade80;
	}
	.pack-per {
		font-size: .6875rem; color: #52525b; margin-top: .25rem;
	}

	/* Costs grid */
	.costs-grid {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 1rem;
	}
	.cost-item { display: flex; align-items: center; gap: .7rem; }
	.cost-name { font-size: .8125rem; font-weight: 500; color: #fff; }
	.cost-amount { font-size: .72rem; color: #52525b; }

	/* Transaction row */
	.tx-row {
		display: flex; align-items: center; justify-content: space-between;
		padding: .85rem 1rem;
		background: rgba(39,39,42,.3);
		border-radius: .65rem;
	}
</style>
