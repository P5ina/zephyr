<script lang="ts">
import {
	ArrowRight,
	Check,
	Github,
	Grid,
	Layers,
	Sparkles,
	Zap,
} from 'lucide-svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();
</script>

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
				<a href="#pricing" class="text-sm text-zinc-400 hover:text-white transition-colors">
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
				Generate sprites, pixel art, and PBR textures in seconds.
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

				<!-- Pixel Art -->
				<div class="p-6 rounded-2xl bg-zinc-900/50 border border-zinc-800 hover:border-zinc-700 transition-colors group">
					<div class="w-12 h-12 rounded-xl bg-amber-500/10 flex items-center justify-center mb-4 group-hover:bg-amber-500/20 transition-colors">
						<Grid class="w-6 h-6 text-amber-400" />
					</div>
					<h3 class="text-lg font-semibold text-white mb-2">Pixel Art</h3>
					<p class="text-sm text-zinc-400">Retro-style assets with crisp pixels and transparent backgrounds.</p>
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
					<p class="text-sm text-zinc-400">Generate assets in seconds with optimized GPU inference on RunPod.</p>
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
				<h2 class="text-3xl md:text-4xl font-bold text-white mb-4">Simple, transparent pricing</h2>
				<p class="text-zinc-400 max-w-xl mx-auto">Start for free, upgrade when you need more. No hidden fees.</p>
			</div>

			<div class="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto">
				<!-- Free Plan -->
				<div class="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col">
					<div class="mb-6">
						<h3 class="text-lg font-semibold text-white mb-2">Free</h3>
						<p class="text-sm text-zinc-400">Perfect for trying out Zephyr</p>
					</div>
					<div class="mb-6">
						<span class="text-4xl font-bold text-white">$0</span>
						<span class="text-zinc-400">/month</span>
					</div>
					<ul class="space-y-3 mb-8 flex-grow">
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							25 tokens/month
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							Basic image generation
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							Up to 3 LoRA uploads
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							Generation history
						</li>
					</ul>
					<a
						href={data.user ? '/app' : '/login'}
						class="block text-center px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
					>
						Get started
					</a>
				</div>

				<!-- Pro Plan -->
				<div class="p-8 rounded-2xl bg-gradient-to-b from-yellow-500/10 to-amber-500/10 border border-yellow-500/30 flex flex-col relative">
					<div class="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 bg-gradient-to-r from-yellow-500 to-amber-500 rounded-full text-xs font-medium text-zinc-900">
						Most Popular
					</div>
					<div class="mb-6">
						<h3 class="text-lg font-semibold text-white mb-2">Pro</h3>
						<p class="text-sm text-zinc-400">For creators who need more</p>
					</div>
					<div class="mb-6">
						<span class="text-4xl font-bold text-white">$25</span>
						<span class="text-zinc-400">/month</span>
					</div>
					<ul class="space-y-3 mb-8 flex-grow">
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-yellow-400 shrink-0" />
							2,500 tokens/month
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-yellow-400 shrink-0" />
							Priority generation queue
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-yellow-400 shrink-0" />
							Unlimited LoRA uploads
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-yellow-400 shrink-0" />
							NSFW content allowed
						</li>
					</ul>
					<a
						href={data.user ? '/app' : '/login'}
						class="block text-center px-6 py-3 bg-gradient-to-r from-yellow-500 to-amber-500 hover:from-yellow-400 hover:to-amber-400 text-zinc-900 font-medium rounded-xl transition-all shadow-lg shadow-yellow-500/25"
					>
						{data.user ? 'Upgrade in App' : 'Start Pro'}
					</a>
				</div>

				<!-- Token Packs -->
				<div class="p-8 rounded-2xl bg-zinc-900/50 border border-zinc-800 flex flex-col">
					<div class="mb-6">
						<h3 class="text-lg font-semibold text-white mb-2">Token Packs</h3>
						<p class="text-sm text-zinc-400">One-time purchase, never expire</p>
					</div>
					<div class="mb-6">
						<span class="text-4xl font-bold text-white">$25+</span>
					</div>
					<ul class="space-y-3 mb-8 flex-grow">
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							500 tokens - $25
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							1,500 tokens - $50
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							5,000 tokens - $100
						</li>
						<li class="flex items-center gap-3 text-sm text-zinc-300">
							<Check class="w-4 h-4 text-green-400 shrink-0" />
							Pay with crypto
						</li>
					</ul>
					<a
						href={data.user ? '/app' : '/login'}
						class="block text-center px-6 py-3 bg-zinc-800 hover:bg-zinc-700 text-white font-medium rounded-xl transition-colors"
					>
						{data.user ? 'Buy in App' : 'Get started'}
					</a>
				</div>
			</div>

			<!-- Token explanation -->
			<div class="mt-16 max-w-2xl mx-auto text-center">
				<h3 class="text-lg font-semibold text-white mb-4">How tokens work</h3>
				<p class="text-zinc-400 text-sm leading-relaxed">
					Sprites and Pixel Art cost 2 tokens each. PBR Textures cost 3 tokens (includes all maps).
					Bonus tokens from packs are used first before your monthly allocation.
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
					<a href="https://github.com" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						<Github class="w-5 h-5" />
					</a>
				</div>
				<p class="text-sm text-zinc-500">© 2025 Zephyr. All rights reserved.</p>
			</div>
		</div>
	</footer>
</div>
