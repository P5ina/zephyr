<script lang="ts">
	import {
		ArrowRight,
		Check,
		Clock,
		CreditCard,
		Layers,
		RotateCw,
		Sparkles,
		Zap,
	} from 'lucide-svelte';
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
	<meta
		name="description"
		content="Simple token-based pricing for AI game asset generation. Start free with 50 tokens, buy more when you need them."
	/>
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<Header
		variant="simple"
		showBack
		user={data.user}
		ctaText="Get Tokens"
		ctaHref="/app/billing"
	/>

	<main class="mx-auto max-w-4xl px-4 py-12">
		<div class="mb-12 text-center">
			<h1 class="mb-4 text-3xl font-bold text-white md:text-4xl">
				Simple, transparent pricing
			</h1>
			<p class="mx-auto max-w-xl text-zinc-400">
				Pay only for what you use. No subscriptions, no monthly fees. Start with
				50 free tokens and buy more when you need them.
			</p>
		</div>

		<!-- Rotation ROI Highlight -->
		<div
			class="mb-8 rounded-2xl border border-orange-500/25 bg-gradient-to-r from-orange-500/10 to-amber-500/10 p-6"
		>
			<div class="flex flex-col items-center gap-6 md:flex-row">
				<div class="flex-1 text-center md:text-left">
					<h2 class="mb-2 text-xl font-bold text-white">
						8-Direction Rotation: from $0.42 per character
					</h2>
					<p class="mb-3 text-sm text-zinc-400">
						Convert your entire character set to 8-direction sprites for less
						than the cost of a coffee.
					</p>
					<div class="flex flex-wrap justify-center gap-3 md:justify-start">
						<div class="flex items-center gap-1.5 text-sm">
							<Clock class="h-4 w-4 text-zinc-500" />
							<span class="text-zinc-500">Manual work:</span>
							<span class="text-zinc-300 line-through">8 hours</span>
						</div>
						<div class="flex items-center gap-1.5 text-sm">
							<Zap class="h-4 w-4 text-orange-400" />
							<span class="text-zinc-500">GenSprite:</span>
							<span class="font-medium text-orange-400">8 seconds</span>
						</div>
					</div>
				</div>
				<a
					href="/app/rotate"
					class="flex items-center gap-2 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 px-5 py-2.5 text-sm font-medium whitespace-nowrap text-zinc-900 transition-all hover:from-orange-400 hover:to-amber-400"
				>
					Try it free
					<ArrowRight class="h-4 w-4" />
				</a>
			</div>
		</div>

		<!-- Free Start Banner -->
		<div
			class="mb-12 rounded-2xl border border-yellow-500/30 bg-gradient-to-r from-yellow-500/10 to-amber-500/10 p-6 text-center"
		>
			<div
				class="mb-3 inline-flex items-center gap-2 rounded-full border border-yellow-500/30 bg-yellow-500/20 px-3 py-1"
			>
				<Sparkles class="h-3.5 w-3.5 text-yellow-400" />
				<span class="text-xs font-medium text-yellow-300">Free to start</span>
			</div>
			<h2 class="mb-2 text-2xl font-bold text-white">
				50 free tokens on signup
			</h2>
			<p class="text-sm text-zinc-400">
				That's ~2 rotations, ~16 sprites, or ~12 textures to try everything out.
				No credit card required.
			</p>
		</div>

		<!-- Token Packs -->
		<div class="mb-12 grid gap-6 md:grid-cols-3">
			<!-- Starter Pack -->
			<div
				class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700"
			>
				<div class="mb-4">
					<h3 class="text-lg font-semibold text-white">Starter</h3>
					<p class="mt-1 text-xs text-zinc-500">Great for trying out</p>
				</div>
				<div class="mb-2">
					<span class="text-4xl font-bold text-white">$10</span>
				</div>
				<div class="mb-4 text-sm text-zinc-400">300 tokens</div>
				<div class="mb-6 text-xs text-zinc-500">
					${getPerTokenPrice(10, 300)} per token
				</div>
				<ul class="mb-6 space-y-2">
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~12 rotations</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~100 sprites</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~75 textures</span>
					</li>
				</ul>
				<a
					href={data.user ? '/app/billing' : '/login'}
					class="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-700"
				>
					<CreditCard class="h-4 w-4" />
					{data.user ? 'Buy Now' : 'Get Started'}
				</a>
			</div>

			<!-- Creator Pack (Popular) -->
			<div
				class="relative rounded-2xl border border-yellow-500/30 bg-gradient-to-b from-yellow-500/10 to-amber-500/10 p-6"
			>
				<div
					class="absolute -top-2.5 left-1/2 -translate-x-1/2 rounded-full bg-gradient-to-r from-yellow-500 to-amber-500 px-2.5 py-0.5 text-xs font-medium text-zinc-900"
				>
					Best Value
				</div>
				<div class="mb-4">
					<h3 class="text-lg font-semibold text-white">Creator</h3>
					<p class="mt-1 text-xs text-zinc-500">Most popular choice</p>
				</div>
				<div class="mb-2">
					<span class="text-4xl font-bold text-white">$25</span>
				</div>
				<div class="mb-1 text-sm text-zinc-400">1,200 tokens</div>
				<div class="mb-6 text-xs text-yellow-400">
					${getPerTokenPrice(25, 1200)} per token — {getDiscount(
						PRICING.creditPacks.creator,
					)}% off
				</div>
				<ul class="mb-6 space-y-2">
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~48 rotations</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~400 sprites</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~300 textures</span>
					</li>
				</ul>
				<a
					href={data.user ? '/app/billing' : '/login'}
					class="flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-yellow-500 to-amber-500 px-4 py-2.5 text-center text-sm font-medium text-zinc-900 shadow-lg shadow-yellow-500/25 transition-all hover:from-yellow-400 hover:to-amber-400"
				>
					<CreditCard class="h-4 w-4" />
					{data.user ? 'Buy Now' : 'Get Started'}
				</a>
			</div>

			<!-- Studio Pack -->
			<div
				class="rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6 transition-colors hover:border-zinc-700"
			>
				<div class="mb-4">
					<h3 class="text-lg font-semibold text-white">Studio</h3>
					<p class="mt-1 text-xs text-zinc-500">For power users</p>
				</div>
				<div class="mb-2">
					<span class="text-4xl font-bold text-white">$50</span>
				</div>
				<div class="mb-1 text-sm text-zinc-400">3,000 tokens</div>
				<div class="mb-6 text-xs text-green-400">
					${getPerTokenPrice(50, 3000)} per token — {getDiscount(
						PRICING.creditPacks.studio,
					)}% off
				</div>
				<ul class="mb-6 space-y-2">
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~120 rotations</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~1,000 sprites</span>
					</li>
					<li class="flex items-center gap-2 text-sm text-zinc-400">
						<Check class="h-4 w-4 text-green-400" />
						<span>~750 textures</span>
					</li>
				</ul>
				<a
					href={data.user ? '/app/billing' : '/login'}
					class="flex items-center justify-center gap-2 rounded-xl bg-zinc-800 px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-zinc-700"
				>
					<CreditCard class="h-4 w-4" />
					{data.user ? 'Buy Now' : 'Get Started'}
				</a>
			</div>
		</div>

		<!-- Token Costs -->
		<div class="mb-12 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
			<h3 class="mb-6 text-center text-lg font-semibold text-white">
				Token costs per generation
			</h3>
			<div class="grid grid-cols-3 gap-4 text-center">
				<div class="rounded-xl border border-orange-500/15 bg-orange-500/5 p-4">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500/10"
					>
						<RotateCw class="h-5 w-5 text-orange-400" />
					</div>
					<p class="mb-1 text-2xl font-bold text-white">
						{PRICING.tokenCosts.rotation}
					</p>
					<p class="text-sm text-zinc-400">tokens per rotation</p>
					<p class="mt-1 text-xs text-orange-400">from $0.42 per character</p>
				</div>
				<div class="rounded-xl bg-zinc-800/50 p-4">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-yellow-500/10"
					>
						<Sparkles class="h-5 w-5 text-yellow-400" />
					</div>
					<p class="mb-1 text-2xl font-bold text-white">
						{PRICING.tokenCosts.sprite}
					</p>
					<p class="text-sm text-zinc-400">tokens per sprite</p>
				</div>
				<div class="rounded-xl bg-zinc-800/50 p-4">
					<div
						class="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-cyan-500/10"
					>
						<Layers class="h-5 w-5 text-cyan-400" />
					</div>
					<p class="mb-1 text-2xl font-bold text-white">
						{PRICING.tokenCosts.texture}
					</p>
					<p class="text-sm text-zinc-400">tokens per texture</p>
				</div>
			</div>
		</div>

		<!-- Features -->
		<div class="mb-12 rounded-2xl border border-zinc-800 bg-zinc-900/50 p-6">
			<h3 class="mb-6 text-lg font-semibold text-white">What's included</h3>
			<div class="grid gap-4 md:grid-cols-2">
				<div class="flex items-start gap-3">
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
					<span class="text-zinc-300">Tokens never expire</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
					<span class="text-zinc-300"
						>Failed generations automatically refunded</span
					>
				</div>
				<div class="flex items-start gap-3">
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
					<span class="text-zinc-300">Full commercial usage rights</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
					<span class="text-zinc-300">PNG with transparency</span>
				</div>
				<div class="flex items-start gap-3">
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
					<span class="text-zinc-300">PBR maps (Normal, Roughness, Height)</span
					>
				</div>
				<div class="flex items-start gap-3">
					<Check class="mt-0.5 h-5 w-5 shrink-0 text-green-400" />
					<span class="text-zinc-300">Unlimited generation history</span>
				</div>
			</div>
		</div>

		<!-- FAQ -->
		<div class="space-y-6">
			<h3 class="text-lg font-semibold text-white">
				Frequently asked questions
			</h3>

			<div class="space-y-4">
				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<h4 class="mb-2 font-medium text-white">Do tokens expire?</h4>
					<p class="text-sm text-zinc-400">
						No, tokens never expire. Use them whenever you're ready.
					</p>
				</div>

				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<h4 class="mb-2 font-medium text-white">
						What happens if a generation fails?
					</h4>
					<p class="text-sm text-zinc-400">
						Tokens are automatically refunded to your account if a generation
						fails due to a system error.
					</p>
				</div>

				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<h4 class="mb-2 font-medium text-white">
						Can I use generated assets commercially?
					</h4>
					<p class="text-sm text-zinc-400">
						Yes, all generated assets are yours to use for personal or
						commercial projects without attribution.
					</p>
				</div>

				<div class="rounded-xl border border-zinc-800 bg-zinc-900/50 p-4">
					<h4 class="mb-2 font-medium text-white">
						What payment methods do you accept?
					</h4>
					<p class="text-sm text-zinc-400">
						We accept all major credit and debit cards via Stripe, including
						Visa, Mastercard, and American Express.
					</p>
				</div>
			</div>
		</div>
	</main>

	<Footer variant="simple" maxWidth="4xl" />
</div>
