<script lang="ts">
import {
	ArrowRight,
	Check,
	Github,
	Layers,
	RotateCw,
	Sparkles,
	Zap,
} from 'lucide-svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const title = 'Zephyr - AI Game Asset Generator | Sprites, Textures & 8-Direction Rotation';
const description = 'Generate game-ready sprites, PBR textures, and 8-directional character rotations with AI. Powered by FLUX.1 and ComfyUI. Start free with 50 tokens.';
const url = 'https://zephyr.p5ina.dev';
const image = 'https://zephyr.p5ina.dev/og-image.png';

const jsonLd = {
	'@context': 'https://schema.org',
	'@graph': [
		{
			'@type': 'WebApplication',
			name: 'Zephyr',
			url,
			description,
			applicationCategory: 'DesignApplication',
			operatingSystem: 'Web',
			offers: {
				'@type': 'Offer',
				price: '0',
				priceCurrency: 'USD',
				description: '50 free tokens on signup'
			},
			featureList: [
				'AI Sprite Generation',
				'PBR Texture Generation',
				'8-Direction Character Rotation',
				'Automatic Background Removal',
				'Normal, Roughness, Height Maps'
			]
		},
		{
			'@type': 'Organization',
			name: 'Zephyr',
			url,
			logo: 'https://zephyr.p5ina.dev/favicon.svg'
		}
	]
};
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="keywords" content="AI game assets, sprite generator, texture generator, PBR textures, game development, indie game dev, 8-direction sprites, character rotation, ComfyUI, FLUX" />

	<!-- Open Graph -->
	<meta property="og:type" content="website" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:site_name" content="Zephyr" />

	<!-- Twitter Card -->
	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={url} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />

	<!-- Structured Data -->
	{@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`}
</svelte:head>

<div class="min-h-screen bg-zinc-950 overflow-hidden">
	<!-- Animated background gradient -->
	<div class="fixed inset-0 overflow-hidden pointer-events-none">
		<div class="absolute -top-1/2 -left-1/2 w-full h-full bg-gradient-to-br from-yellow-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse"></div>
		<div class="absolute -bottom-1/2 -right-1/2 w-full h-full bg-gradient-to-tl from-amber-500/20 via-transparent to-transparent rounded-full blur-3xl animate-pulse" style="animation-delay: 1s;"></div>
	</div>

	<!-- Navigation -->
	<nav class="relative z-10 border-b border-zinc-800/50 backdrop-blur-sm">
		<div class="max-w-6xl mx-auto px-4 py-4 flex items-center justify-between">
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center">
					<Sparkles class="w-4 h-4 text-zinc-900" />
				</div>
				<span class="text-xl font-bold text-white">Zephyr</span>
			</div>
			<div class="flex items-center gap-6">
				<a href="#features" class="text-sm text-zinc-400 hover:text-white transition-colors">
					Features
				</a>
				<a href="/pricing" class="text-sm text-zinc-400 hover:text-white transition-colors">
					Pricing
				</a>
				{#if data.user}
					<a
						href="/app"
						class="px-4 py-2 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 text-sm font-medium rounded-lg transition-colors"
					>
						Go to App
					</a>
				{:else}
					<a
						href="/login"
						class="px-4 py-2 bg-white/10 hover:bg-white/20 text-white text-sm font-medium rounded-lg transition-colors backdrop-blur-sm border border-white/10"
					>
						Sign in
					</a>
				{/if}
			</div>
		</div>
	</nav>

	<!-- Hero Section -->
	<section class="relative z-10 max-w-6xl mx-auto px-4 pt-20 pb-32">
		<div class="text-center">
			<div class="inline-flex items-center gap-2 px-3 py-1 mb-6 rounded-full bg-yellow-500/10 border border-yellow-500/20">
				<Zap class="w-3.5 h-3.5 text-yellow-400" />
				<span class="text-xs font-medium text-yellow-300">Powered by FLUX.1 + ComfyUI</span>
			</div>
			<h1 class="text-5xl md:text-7xl font-bold text-white mb-6 tracking-tight">
				Create game-ready assets<br />
				<span class="bg-linear-to-r from-yellow-300 via-amber-400 to-orange-400 bg-clip-text text-transparent">with AI magic</span>
			</h1>
			<p class="text-lg md:text-xl text-zinc-400 mb-10 max-w-2xl mx-auto leading-relaxed">
				Generate sprites and PBR textures in seconds.
				Perfect for indie developers, game designers, and creative studios.
			</p>
			<div class="flex flex-col sm:flex-row items-center justify-center gap-4">
				{#if data.user}
					<a
						href="/app"
						class="group inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-semibold rounded-xl transition-all shadow-lg shadow-yellow-500/25 hover:shadow-yellow-500/40"
					>
						Go to App
						<ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
					</a>
				{:else}
					<a
						href="/login"
						class="group inline-flex items-center gap-2 px-8 py-4 bg-linear-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-semibold rounded-xl transition-all shadow-lg shadow-yellow-500/25 hover:shadow-yellow-500/40"
					>
						<Github class="w-5 h-5" />
						Start creating for free
						<ArrowRight class="w-4 h-4 group-hover:translate-x-1 transition-transform" />
					</a>
				{/if}
				<a
					href="#pricing"
					class="inline-flex items-center gap-2 px-8 py-4 text-zinc-300 hover:text-white font-medium transition-colors"
				>
					View pricing
				</a>
			</div>
		</div>

		<!-- Hero visual -->
		<div class="mt-20 relative">
			<div class="absolute inset-0 bg-gradient-to-t from-zinc-950 via-transparent to-transparent z-10 pointer-events-none"></div>
			<div class="grid grid-cols-2 md:grid-cols-4 gap-4">
				<div class="aspect-square rounded-2xl bg-gradient-to-br from-yellow-900/50 to-amber-900/50 border border-zinc-800 overflow-hidden">
					<div class="w-full h-full bg-[url('https://images.unsplash.com/photo-1618005182384-a83a8bd57fbe?w=400&h=400&fit=crop')] bg-cover bg-center opacity-80"></div>
				</div>
				<div class="aspect-square rounded-2xl bg-gradient-to-br from-amber-900/50 to-orange-900/50 border border-zinc-800 overflow-hidden mt-8">
					<div class="w-full h-full bg-[url('https://images.unsplash.com/photo-1634017839464-5c339bbe3c35?w=400&h=400&fit=crop')] bg-cover bg-center opacity-80"></div>
				</div>
				<div class="aspect-square rounded-2xl bg-gradient-to-br from-orange-900/50 to-red-900/50 border border-zinc-800 overflow-hidden">
					<div class="w-full h-full bg-[url('https://images.unsplash.com/photo-1614850715649-1d0106293bd1?w=400&h=400&fit=crop')] bg-cover bg-center opacity-80"></div>
				</div>
				<div class="aspect-square rounded-2xl bg-gradient-to-br from-red-900/50 to-yellow-900/50 border border-zinc-800 overflow-hidden mt-8">
					<div class="w-full h-full bg-[url('https://images.unsplash.com/photo-1620641788421-7a1c342ea42e?w=400&h=400&fit=crop')] bg-cover bg-center opacity-80"></div>
				</div>
			</div>
		</div>
	</section>

	<!-- Features Section -->
	<section id="features" class="relative z-10 border-t border-zinc-800/50">
		<div class="max-w-6xl mx-auto px-4 py-24">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Everything you need to create</h2>
				<p class="text-zinc-400 max-w-xl mx-auto">Powerful features that make image generation fast, flexible, and fun.</p>
			</div>

			<div class="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
				<!-- Game Sprites -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group">
					<div class="w-12 h-12 rounded-xl bg-yellow-500/10 flex items-center justify-center mb-4 group-hover:bg-yellow-500/20 transition-colors">
						<Sparkles class="w-6 h-6 text-yellow-400" />
					</div>
					<h3 class="text-lg font-semibold text-white mb-2">Game Sprites</h3>
					<p class="text-sm text-zinc-400">Characters, items, UI elements with automatic background removal.</p>
				</div>

				<!-- 8-Direction Rotation -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group">
					<div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
						<RotateCw class="w-6 h-6 text-amber-400" />
					</div>
					<h3 class="text-lg font-semibold text-white mb-2">8-Direction Rotation</h3>
					<p class="text-sm text-zinc-400">Generate sprites in all 8 directions using 3D reconstruction.</p>
				</div>

				<!-- PBR Textures -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group">
					<div class="w-12 h-12 rounded-xl bg-orange-500/10 flex items-center justify-center mb-4 group-hover:bg-orange-500/20 transition-colors">
						<Layers class="w-6 h-6 text-orange-400" />
					</div>
					<h3 class="text-lg font-semibold text-white mb-2">PBR Textures</h3>
					<p class="text-sm text-zinc-400">Complete texture sets with Normal, Roughness, and Height maps.</p>
				</div>

				<!-- Fast Generation -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group">
					<div class="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center mb-4 group-hover:bg-red-500/20 transition-colors">
						<Zap class="w-6 h-6 text-red-400" />
					</div>
					<h3 class="text-lg font-semibold text-white mb-2">Lightning Fast</h3>
					<p class="text-sm text-zinc-400">Generate assets in seconds with optimized GPU inference.</p>
				</div>
			</div>

			<!-- Additional features list -->
			<div class="mt-16 grid md:grid-cols-2 gap-8">
				<div class="space-y-4">
					<h3 class="text-xl font-semibold text-white mb-6">Asset Generation</h3>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">Automatic background removal (BiRefNet)</span>
					</div>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">PBR maps: Normal, Roughness, Height</span>
					</div>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">Multiple sizes up to 1024x1024</span>
					</div>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">Seed control for reproducible results</span>
					</div>
				</div>
				<div class="space-y-4">
					<h3 class="text-xl font-semibold text-white mb-6">Game-Ready Output</h3>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">PNG with transparency for sprites</span>
					</div>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">Tileable textures for seamless patterns</span>
					</div>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">Direct download or cloud storage</span>
					</div>
					<div class="flex items-start gap-3">
						<Check class="w-5 h-5 text-yellow-400 mt-0.5 shrink-0" />
						<span class="text-zinc-300">Full generation history</span>
					</div>
				</div>
			</div>
		</div>
	</section>

	<!-- Pricing Section -->
	<section id="pricing" class="relative z-10 border-t border-zinc-800/50">
		<div class="max-w-6xl mx-auto px-4 py-24">
			<div class="text-center mb-16">
				<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Pay only for what you use</h2>
				<p class="text-zinc-400 max-w-xl mx-auto">No subscriptions. No monthly fees. Start with 50 free tokens and buy more when you need them.</p>
			</div>

			<!-- Free Start Banner -->
			<div class="max-w-2xl mx-auto mb-12 p-6 rounded-2xl bg-gradient-to-r from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 text-center">
				<div class="inline-flex items-center gap-2 px-3 py-1 mb-3 rounded-full bg-yellow-500/20 border border-yellow-500/30">
					<Sparkles class="w-3.5 h-3.5 text-yellow-400" />
					<span class="text-xs font-medium text-yellow-300">Free to start</span>
				</div>
				<h3 class="text-2xl font-bold text-white mb-2">50 free tokens on signup</h3>
				<p class="text-zinc-400 text-sm">That's ~25 sprites, ~10 textures, or ~6 rotations to try everything out.</p>
			</div>

			<!-- Token Packs -->
			<div class="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
				<!-- Starter Pack -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
					<div class="mb-4">
						<h3 class="text-lg font-semibold text-white">Starter</h3>
						<p class="text-xs text-zinc-500 mt-1">~250 sprites</p>
					</div>
					<div class="mb-4">
						<span class="text-3xl font-bold text-white">$10</span>
						<span class="text-zinc-500 text-sm ml-1">/ 500 tokens</span>
					</div>
					<p class="text-xs text-zinc-400 mb-4">$0.02 per token</p>
					<a
						href={data.user ? '/app/billing' : '/login'}
						class="block text-center px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors"
					>
						Buy tokens
					</a>
				</div>

				<!-- Popular Pack -->
				<div class="p-6 rounded-2xl bg-gradient-to-b from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 relative">
					<div class="absolute -top-2.5 left-1/2 -translate-x-1/2 px-2.5 py-0.5 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full text-xs font-medium text-zinc-900">
						Best Value
					</div>
					<div class="mb-4">
						<h3 class="text-lg font-semibold text-white">Creator</h3>
						<p class="text-xs text-zinc-500 mt-1">~1,000 sprites</p>
					</div>
					<div class="mb-4">
						<span class="text-3xl font-bold text-white">$25</span>
						<span class="text-zinc-500 text-sm ml-1">/ 2,000 tokens</span>
					</div>
					<p class="text-xs text-yellow-400 mb-4">$0.0125 per token — 37% off</p>
					<a
						href={data.user ? '/app/billing' : '/login'}
						class="block text-center px-4 py-2.5 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 text-sm font-medium rounded-xl transition-all shadow-lg shadow-yellow-500/25"
					>
						Buy tokens
					</a>
				</div>

				<!-- Studio Pack -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors">
					<div class="mb-4">
						<h3 class="text-lg font-semibold text-white">Studio</h3>
						<p class="text-xs text-zinc-500 mt-1">~3,000 sprites</p>
					</div>
					<div class="mb-4">
						<span class="text-3xl font-bold text-white">$50</span>
						<span class="text-zinc-500 text-sm ml-1">/ 6,000 tokens</span>
					</div>
					<p class="text-xs text-green-400 mb-4">$0.0083 per token — 58% off</p>
					<a
						href={data.user ? '/app/billing' : '/login'}
						class="block text-center px-4 py-2.5 bg-zinc-800 hover:bg-zinc-700 text-white text-sm font-medium rounded-xl transition-colors"
					>
						Buy tokens
					</a>
				</div>
			</div>

			<!-- Token costs breakdown -->
			<div class="mt-16 max-w-3xl mx-auto">
				<h3 class="text-lg font-semibold text-white mb-6 text-center">What can you create?</h3>
				<div class="grid grid-cols-3 gap-4 text-center">
					<div class="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
						<div class="w-10 h-10 rounded-lg bg-yellow-500/10 flex items-center justify-center mx-auto mb-3">
							<Sparkles class="w-5 h-5 text-yellow-400" />
						</div>
						<p class="text-2xl font-bold text-white mb-1">2</p>
						<p class="text-xs text-zinc-400">tokens per sprite</p>
					</div>
					<div class="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
						<div class="w-10 h-10 rounded-lg bg-orange-500/10 flex items-center justify-center mx-auto mb-3">
							<Layers class="w-5 h-5 text-orange-400" />
						</div>
						<p class="text-2xl font-bold text-white mb-1">5</p>
						<p class="text-xs text-zinc-400">tokens per texture set</p>
					</div>
					<div class="p-4 rounded-xl bg-zinc-900/50 border border-zinc-800">
						<div class="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center mx-auto mb-3">
							<RotateCw class="w-5 h-5 text-amber-400" />
						</div>
						<p class="text-2xl font-bold text-white mb-1">8</p>
						<p class="text-xs text-zinc-400">tokens per 8-dir rotation</p>
					</div>
				</div>
				<p class="text-xs text-zinc-500 text-center mt-6">
					Tokens never expire. Failed generations are automatically refunded.
				</p>
			</div>
		</div>
	</section>

	<!-- Footer -->
	<footer class="relative z-10 border-t border-zinc-800/50">
		<div class="max-w-6xl mx-auto px-4 py-12">
			<div class="flex flex-col md:flex-row items-center justify-between gap-6">
				<div class="flex items-center gap-2">
					<div class="w-6 h-6 rounded-md bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center">
						<Sparkles class="w-3 h-3 text-zinc-900" />
					</div>
					<span class="text-sm font-semibold text-white">Zephyr</span>
				</div>
				<div class="flex items-center gap-6 text-sm text-zinc-400">
					<a href="/terms" class="hover:text-white transition-colors">Terms</a>
					<a href="/privacy" class="hover:text-white transition-colors">Privacy</a>
					<a href="/refund" class="hover:text-white transition-colors">Refunds</a>
					<a href="https://github.com" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						<Github class="w-5 h-5" />
					</a>
				</div>
				<p class="text-sm text-zinc-500">© 2025 Zephyr. All rights reserved.</p>
			</div>
		</div>
	</footer>
</div>
