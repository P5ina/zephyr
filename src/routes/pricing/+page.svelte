<script lang="ts">
import { Check, Layers, RotateCw, Sparkles } from 'lucide-svelte';
import Footer from '$lib/components/Footer.svelte';
import Header from '$lib/components/Header.svelte';
import { PRICING } from '$lib/pricing';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

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

<svelte:head>
	<title>Pricing - GenSprite</title>
	<meta name="description" content="Simple token-based pricing for AI game asset generation. Start free with 50 tokens, buy more when you need them." />
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<Header variant="simple" showBack user={data.user} ctaText="Buy Tokens" ctaHref="/app/billing" maxWidth="4xl" />

	<main class="max-w-4xl mx-auto px-4 py-12">
		<div class="text-center mb-12">
			<h1 class="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h1>
			<p class="text-zinc-400 max-w-xl mx-auto">
				Pay only for what you use. No subscriptions, no monthly fees. Start with 50 free tokens and buy more when you need them.
			</p>
		</div>

		<!-- Free Start Banner -->
		<div class="mb-12 p-6 rounded-2xl bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 text-center">
			<div class="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-yellow-500/20 border border-yellow-500/30">
				<Sparkles class="w-3.5 h-3.5 text-yellow-400" />
				<span class="text-xs font-medium text-yellow-300">Free to start</span>
			</div>
			<h2 class="text-2xl font-bold text-white mb-2">50 free tokens on signup</h2>
			<p class="text-zinc-400 text-sm">That's ~25 sprites, ~12 textures, or ~8 rotations to try everything out. No credit card required.</p>
		</div>

		<!-- Token Packs -->
		<div class="grid md:grid-cols-3 gap-6 mb-12">
			<!-- Starter Pack -->
			<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
				<div class="mb-4">
					<h3 class="text-lg font-semibold text-white">Starter</h3>
					<p class="text-xs text-zinc-500 mt-1">Great for trying out</p>
				</div>
				<div class="mb-2">
					<span class="text-4xl font-bold text-white">$5</span>
				</div>
				<div class="text-sm text-zinc-400 mb-4">300 tokens</div>
				<div class="text-xs text-zinc-500 mb-6">${getPerTokenPrice(5, 300)} per token</div>
				<ul class="space-y-2 mb-6">
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~150 sprites</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~75 textures</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~50 rotations</span>
					</li>
				</ul>
				<a
					href={data.user ? '/app/billing' : '/login'}
					class="block text-center px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors"
				>
					Get started
				</a>
			</div>

			<!-- Creator Pack (Popular) -->
			<div class="p-6 rounded-2xl bg-gradient-to-b from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 relative">
				<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full text-xs font-medium text-zinc-900">
					Best Value
				</div>
				<div class="mb-4">
					<h3 class="text-lg font-semibold text-white">Creator</h3>
					<p class="text-xs text-zinc-500 mt-1">Most popular choice</p>
				</div>
				<div class="mb-2">
					<span class="text-4xl font-bold text-white">$15</span>
				</div>
				<div class="text-sm text-zinc-400 mb-1">1,200 tokens</div>
				<div class="text-xs text-yellow-400 mb-6">${getPerTokenPrice(15, 1200)} per token — 25% off</div>
				<ul class="space-y-2 mb-6">
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~600 sprites</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~300 textures</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~200 rotations</span>
					</li>
				</ul>
				<a
					href={data.user ? '/app/billing' : '/login'}
					class="block text-center px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 text-sm font-medium rounded-xl transition-all shadow-lg shadow-yellow-500/25"
				>
					Get started
				</a>
			</div>

			<!-- Studio Pack -->
			<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
				<div class="mb-4">
					<h3 class="text-lg font-semibold text-white">Studio</h3>
					<p class="text-xs text-zinc-500 mt-1">For power users</p>
				</div>
				<div class="mb-2">
					<span class="text-4xl font-bold text-white">$35</span>
				</div>
				<div class="text-sm text-zinc-400 mb-1">4,000 tokens</div>
				<div class="text-xs text-green-400 mb-6">${getPerTokenPrice(35, 4000)} per token — 48% off</div>
				<ul class="space-y-2 mb-6">
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~2,000 sprites</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~1,000 textures</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="w-4 h-4 text-green-400" />
						<span>~666 rotations</span>
					</li>
				</ul>
				<a
					href={data.user ? '/app/billing' : '/login'}
					class="block text-center px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors"
				>
					Get started
				</a>
			</div>
		</div>

		<!-- Token Costs -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-12">
			<h3 class="text-lg font-semibold text-white mb-6 text-center">Token costs per generation</h3>
			<div class="grid grid-cols-3 gap-4 text-center">
				<div class="p-4 rounded-xl bg-zinc-800/50">
					<div class="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center mx-auto mb-3">
						<Sparkles class="w-5 h-5 text-yellow-400" />
					</div>
					<p class="text-2xl font-bold text-white mb-1">{PRICING.tokenCosts.sprite}</p>
					<p class="text-sm text-zinc-400">tokens per sprite</p>
				</div>
				<div class="p-4 rounded-xl bg-zinc-800/50">
					<div class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
						<Layers class="w-5 h-5 text-orange-400" />
					</div>
					<p class="text-2xl font-bold text-white mb-1">{PRICING.tokenCosts.texture}</p>
					<p class="text-sm text-zinc-400">tokens per texture</p>
				</div>
				<div class="p-4 rounded-xl bg-zinc-800/50">
					<div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
						<RotateCw class="w-5 h-5 text-amber-400" />
					</div>
					<p class="text-2xl font-bold text-white mb-1">{PRICING.tokenCosts.rotation}</p>
					<p class="text-sm text-zinc-400">tokens per rotation</p>
				</div>
			</div>
		</div>

		<!-- Features -->
		<div class="bg-zinc-900/50 border border-zinc-800 rounded-2xl p-6 mb-12">
			<h3 class="text-lg font-semibold text-white mb-6">What's included</h3>
			<div class="grid md:grid-cols-2 gap-4">
				<div class="flex items-start gap-3">
					<Check class="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
					<span class="text-zinc-300">Tokens never expire</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
					<span class="text-zinc-300">Failed generations automatically refunded</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
					<span class="text-zinc-300">Full commercial usage rights</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
					<span class="text-zinc-300">PNG with transparency</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
					<span class="text-zinc-300">PBR maps (Normal, Roughness, Height)</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="w-5 h-5 text-green-400 mt-0.5 shrink-0" />
					<span class="text-zinc-300">Unlimited generation history</span>
				</div>
			</div>
		</div>

		<!-- FAQ -->
		<div class="space-y-6">
			<h3 class="text-lg font-semibold text-white">Frequently asked questions</h3>

			<div class="space-y-4">
				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
					<h4 class="font-medium text-white mb-2">Do tokens expire?</h4>
					<p class="text-sm text-zinc-400">No, tokens never expire. Use them whenever you're ready.</p>
				</div>

				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
					<h4 class="font-medium text-white mb-2">What happens if a generation fails?</h4>
					<p class="text-sm text-zinc-400">Tokens are automatically refunded to your account if a generation fails due to a system error.</p>
				</div>

				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
					<h4 class="font-medium text-white mb-2">Can I use generated assets commercially?</h4>
					<p class="text-sm text-zinc-400">Yes, all generated assets are yours to use for personal or commercial projects without attribution.</p>
				</div>

				<div class="bg-zinc-900/50 border border-zinc-800 rounded-xl p-4">
					<h4 class="font-medium text-white mb-2">What payment methods do you accept?</h4>
					<p class="text-sm text-zinc-400">We accept all major credit cards, debit cards, and PayPal through our payment provider Paddle.</p>
				</div>
			</div>
		</div>
	</main>

	<Footer variant="simple" maxWidth="4xl" />
</div>
