<script lang="ts">
import {
	ArrowRight,
	Layers,
	Paintbrush,
	Play,
	RotateCw,
	Sparkles,
} from 'lucide-svelte';
import Footer from '$lib/components/Footer.svelte';
import Header from '$lib/components/Header.svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const title =
	'GenSprite - AI Game Asset Generator | Sprites, Textures & 8-Direction Rotation';
const description =
	'Generate game-ready sprites, PBR textures, and 8-directional character rotations with AI. Start free with 50 tokens.';
const url = 'https://gensprite.ai';
const image = 'https://gensprite.ai/og-image.png';

const jsonLd = {
	'@context': 'https://schema.org',
	'@graph': [
		{
			'@type': 'WebApplication',
			name: 'GenSprite',
			url,
			description,
			applicationCategory: 'DesignApplication',
			operatingSystem: 'Web',
			offers: {
				'@type': 'Offer',
				price: '0',
				priceCurrency: 'USD',
				description: '3 free generations, no signup required',
			},
			featureList: [
				'AI Sprite Generation',
				'PBR Texture Generation',
				'8-Direction Character Rotation',
				'Concept Art Generation',
					'Automatic Background Removal',
				'Normal, Roughness, Height Maps',
			],
		},
		{
			'@type': 'Organization',
			name: 'GenSprite',
			url,
			logo: 'https://gensprite.ai/icon-512.png',
		},
	],
};

function inView(node: HTMLElement) {
	if (typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
		node.classList.add('in-view');
		return {};
	}
	const observer = new IntersectionObserver(
		([entry]) => {
			if (entry.isIntersecting) {
				node.classList.add('in-view');
				observer.disconnect();
			}
		},
		{ threshold: 0.12, rootMargin: '0px 0px -30px 0px' },
	);
	observer.observe(node);
	return { destroy: () => observer.disconnect() };
}
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="description" content={description} />
	<meta name="keywords" content="AI game assets, sprite generator, texture generator, PBR textures, game development, indie game dev, 8-direction sprites, character rotation" />

	<meta property="og:type" content="website" />
	<meta property="og:url" content={url} />
	<meta property="og:title" content={title} />
	<meta property="og:description" content={description} />
	<meta property="og:image" content={image} />
	<meta property="og:site_name" content="GenSprite" />

	<meta name="twitter:card" content="summary_large_image" />
	<meta name="twitter:url" content={url} />
	<meta name="twitter:title" content={title} />
	<meta name="twitter:description" content={description} />
	<meta name="twitter:image" content={image} />

	{@html `<script type="application/ld+json">${JSON.stringify(jsonLd)}</script>`}
</svelte:head>

<div class="landing">
	<!-- Background atmosphere -->
	<div class="bg-layer" aria-hidden="true">
		<div class="orb orb-1"></div>
		<div class="orb orb-2"></div>
		<div class="orb orb-3"></div>
		<div class="dot-grid"></div>
	</div>

	<Header user={data.user} />

	<!-- OIIA Promo -->
	<div class="oiia-bar">
		<a href="/spin" class="oiia-link">
			<span class="oiia-badge">
				<Play class="w-3 h-3" />
				NEW
			</span>
			<span class="oiia-text">
				<strong>OIIA Spin Generator</strong> — Create viral spinning videos
			</span>
			<ArrowRight class="w-3.5 h-3.5 oiia-arrow" />
		</a>
	</div>

	<!-- Hero -->
	<section class="hero">
		<!-- Floating sprites (desktop) -->
		<div class="sprites-constellation">
			<div class="sprite-float sprite-fl-1 hero-reveal" style="animation-delay:.4s">
				<img src="/showcase/knight.png" alt="Knight sprite" />
			</div>
			<div class="sprite-float sprite-fl-2 hero-reveal" style="animation-delay:.55s">
				<img src="/showcase/crystal.png" alt="Crystal sprite" />
			</div>
			<div class="sprite-float sprite-fl-3 hero-reveal" style="animation-delay:.7s">
				<img src="/showcase/shield.png" alt="Shield sprite" />
			</div>
			<div class="sprite-float sprite-fl-4 hero-reveal" style="animation-delay:.85s">
				<img src="/showcase/robot.png" alt="Robot sprite" />
			</div>
			<div class="sprite-float sprite-fl-5 hero-reveal" style="animation-delay:1s">
				<img src="/showcase/sword.png" alt="Sword sprite" />
			</div>
			<div class="sprite-float sprite-fl-6 hero-reveal" style="animation-delay:1.15s">
				<img src="/showcase/chest.png" alt="Treasure chest" />
			</div>
		</div>

		<div class="hero-inner">
			<h1 class="hero-title hero-reveal">
				Generate game assets
				<span class="hero-accent">that feel alive</span>
			</h1>
			<p class="hero-sub hero-reveal" style="animation-delay:.12s">
				AI-powered sprites, PBR textures, and 8-directional rotations.
				Built for indie devs who ship fast.
			</p>
			<div class="hero-ctas hero-reveal" style="animation-delay:.22s">
				<a href="/app" class="btn-primary">
					{#if data.user}
						Generate
					{:else}
						Try free — no signup
					{/if}
					<ArrowRight class="w-4 h-4" />
				</a>
				<a href="#pricing" class="btn-ghost">View pricing</a>
			</div>
		</div>

		<!-- Mobile sprite grid -->
		<div class="sprites-mobile hero-reveal" style="animation-delay:.45s">
			{#each [
				{ src: '/showcase/knight.png', alt: 'Knight' },
				{ src: '/showcase/robot.png', alt: 'Robot' },
				{ src: '/showcase/sword.png', alt: 'Sword' },
				{ src: '/showcase/chest.png', alt: 'Chest' },
				{ src: '/showcase/shield.png', alt: 'Shield' },
				{ src: '/showcase/crystal.png', alt: 'Crystal' },
			] as sprite}
				<div class="sprite-cell">
					<img src={sprite.src} alt={sprite.alt} />
				</div>
			{/each}
		</div>
	</section>

	<!-- Features -->
	<section id="features" class="section features-section">
		<div class="container">
			<div class="section-head" use:inView>
				<span class="tag">Tools</span>
				<h2 class="section-title">Everything you need to create</h2>
				<p class="section-sub">From sprites to concept art — all powered by AI, all game-ready.</p>
			</div>

			<div class="features-grid">
				<div class="feat-card" use:inView style="transition-delay:.08s">
					<div class="feat-icon feat-icon-amber">
						<Sparkles class="w-6 h-6" />
					</div>
					<h3 class="feat-name">Sprite Generation</h3>
					<p class="feat-desc">
						Characters, items, weapons, UI elements — describe it and get a transparent PNG in seconds. Powered by SDXL with automatic background removal.
					</p>
					<div class="feat-foot">
						<span class="feat-cost">3 tokens</span>
						<span class="feat-detail">Up to 1024 &times; 1024</span>
					</div>
				</div>

				<div class="feat-card" use:inView style="transition-delay:.14s">
					<div class="feat-icon feat-icon-orange">
						<RotateCw class="w-6 h-6" />
					</div>
					<h3 class="feat-name">8-Direction Rotation</h3>
					<p class="feat-desc">
						Upload any sprite and get all 8 cardinal directions. Uses SV3D reconstruction with ControlNet refinement for consistent output.
					</p>
					<div class="feat-foot">
						<span class="feat-cost">6 tokens</span>
						<span class="feat-detail">N / NE / E / SE / S / SW / W / NW</span>
					</div>
				</div>

				<div class="feat-card" use:inView style="transition-delay:.2s">
					<div class="feat-icon feat-icon-cyan">
						<Layers class="w-6 h-6" />
					</div>
					<h3 class="feat-name">PBR Textures</h3>
					<p class="feat-desc">
						Complete material sets with base color, normal, roughness, and metallic maps. Preview in real-time 3D before downloading.
					</p>
					<div class="feat-foot">
						<span class="feat-cost">4 tokens</span>
						<span class="feat-detail">4 map types included</span>
					</div>
				</div>

				<div class="feat-card" use:inView style="transition-delay:.26s">
					<div class="feat-icon feat-icon-violet">
						<Paintbrush class="w-6 h-6" />
					</div>
					<h3 class="feat-name">Concept Art</h3>
					<p class="feat-desc">
						Generate full-scene concept art from text prompts. Choose from 9 style presets, multiple aspect ratios, and restyle mode to preserve structure.
					</p>
					<div class="feat-foot">
						<span class="feat-cost">4 tokens</span>
						<span class="feat-detail">Restyle mode: 6 tokens</span>
					</div>
				</div>

				</div>
		</div>
	</section>

	<!-- Process -->
	<section class="section process-section">
		<div class="container">
			<div class="section-head" use:inView>
				<span class="tag">Process</span>
				<h2 class="section-title">Describe. Generate. Ship.</h2>
			</div>

			<div class="steps">
				<div class="step" use:inView style="transition-delay:.06s">
					<span class="step-num">01</span>
					<h3>Describe your asset</h3>
					<p>Write a text prompt describing the sprite, texture, or character you need.</p>
				</div>
				<div class="step-line" aria-hidden="true"></div>
				<div class="step" use:inView style="transition-delay:.16s">
					<span class="step-num">02</span>
					<h3>AI generates it</h3>
					<p>Our pipeline runs SDXL, background removal, and refinement in seconds.</p>
				</div>
				<div class="step-line" aria-hidden="true"></div>
				<div class="step" use:inView style="transition-delay:.26s">
					<span class="step-num">03</span>
					<h3>Download &amp; use</h3>
					<p>Get transparent PNGs, texture sets, or 8-direction sprite sheets — game-ready.</p>
				</div>
			</div>
		</div>
	</section>

	<!-- Showcase: Sprites -->
	<section class="section showcase-section">
		<div class="container">
			<div class="section-head" use:inView>
				<span class="tag">Showcase</span>
				<h2 class="section-title">Made with GenSprite</h2>
				<p class="section-sub">Real assets generated by our users — every image below was created in seconds.</p>
			</div>

			<!-- Sprite Generation -->
			<div class="sc-feature" use:inView style="transition-delay:.06s">
				<div class="sc-feature-header">
					<div class="sc-feature-icon sc-icon-amber">
						<Sparkles class="w-5 h-5" />
					</div>
					<div>
						<h3 class="sc-feature-title">Sprite Generation</h3>
						<p class="sc-feature-sub">Characters, items, weapons — describe it, get a transparent PNG.</p>
					</div>
				</div>
				<div class="sc-sprites-grid">
					{#each [
						{ src: '/showcase/knight.png', label: 'Knight' },
						{ src: '/showcase/robot.png', label: 'Robot' },
						{ src: '/showcase/sword.png', label: 'Sword' },
						{ src: '/showcase/crystal.png', label: 'Crystal' },
						{ src: '/showcase/shield.png', label: 'Shield' },
						{ src: '/showcase/chest.png', label: 'Chest' },
					] as item}
						<div class="sc-sprite-cell">
							<img src={item.src} alt={item.label} loading="lazy" />
							<span class="sc-sprite-label">{item.label}</span>
						</div>
					{/each}
				</div>
			</div>

			<!-- 8-Direction Rotation -->
			<div class="sc-feature" use:inView style="transition-delay:.14s">
				<div class="sc-feature-header">
					<div class="sc-feature-icon sc-icon-orange">
						<RotateCw class="w-5 h-5" />
					</div>
					<div>
						<h3 class="sc-feature-title">8-Direction Rotation</h3>
						<p class="sc-feature-sub">Upload a sprite, get all 8 cardinal &amp; ordinal directions via SV3D.</p>
					</div>
				</div>
				<div class="sc-rotation-wrap">
					<div class="sc-rotation-compass">
						{#each [
							{ dir: 'NW', row: 1, col: 1, src: '/showcase/rotation/sprite_nw.png' },
							{ dir: 'N', row: 1, col: 2, src: '/showcase/rotation/sprite_n.png' },
							{ dir: 'NE', row: 1, col: 3, src: '/showcase/rotation/sprite_ne.png' },
							{ dir: 'W', row: 2, col: 1, src: '/showcase/rotation/sprite_w.png' },
							{ dir: '', row: 2, col: 2, src: '/showcase/rotation/sprite_s.png' },
							{ dir: 'E', row: 2, col: 3, src: '/showcase/rotation/sprite_e.png' },
							{ dir: 'SW', row: 3, col: 1, src: '/showcase/rotation/sprite_sw.png' },
							{ dir: 'S', row: 3, col: 2, src: '/showcase/rotation/sprite_s.png' },
							{ dir: 'SE', row: 3, col: 3, src: '/showcase/rotation/sprite_se.png' },
						] as cell}
							<div
								class="sc-rot-cell"
								class:sc-rot-center={cell.dir === ''}
								style="grid-row:{cell.row};grid-column:{cell.col}"
							>
								{#if cell.dir === ''}
									<img src={cell.src} alt="Input sprite" class="sc-rot-input" />
									<span class="sc-rot-badge">Input</span>
								{:else}
									<img src={cell.src} alt="{cell.dir} rotation" class="sc-rot-dir-img" loading="lazy" />
									<span class="sc-rot-dir-label">{cell.dir}</span>
								{/if}
							</div>
						{/each}
					</div>
					<div class="sc-rotation-note">
						<p>Each direction is independently refined with ControlNet Tile + IPAdapter for consistency.</p>
					</div>
				</div>
			</div>

			<!-- PBR Textures -->
			<div class="sc-feature" use:inView style="transition-delay:.22s">
				<div class="sc-feature-header">
					<div class="sc-feature-icon sc-icon-cyan">
						<Layers class="w-5 h-5" />
					</div>
					<div>
						<h3 class="sc-feature-title">PBR Textures</h3>
						<p class="sc-feature-sub">Complete material sets with 4 map types, previewed in real-time 3D.</p>
					</div>
				</div>
				<div class="sc-textures-wrap">
					<div class="sc-textures-grid">
						{#each [
							{ label: 'Base Color', gradient: 'linear-gradient(135deg, #8B7355, #A0845C, #6B5B45, #9C8A6A)', desc: 'Diffuse color' },
							{ label: 'Normal', gradient: 'linear-gradient(135deg, #8080FF, #7B7BF0, #8888FF, #7575E8)', desc: 'Surface detail' },
							{ label: 'Roughness', gradient: 'linear-gradient(135deg, #555, #888, #666, #777)', desc: 'Surface finish' },
							{ label: 'Metallic', gradient: 'linear-gradient(135deg, #111, #333, #111, #222)', desc: 'Metal vs non-metal' },
						] as map}
							<div class="sc-tex-card">
								<div class="sc-tex-preview" style="background:{map.gradient}">
									<div class="sc-tex-noise"></div>
								</div>
								<div class="sc-tex-info">
									<span class="sc-tex-name">{map.label}</span>
									<span class="sc-tex-desc">{map.desc}</span>
								</div>
							</div>
						{/each}
					</div>
					<div class="sc-textures-note">
						<p>All 4 maps are generated together and can be previewed on a 3D sphere, cube, or plane before downloading.</p>
					</div>
				</div>
			</div>

			<!-- Concept Art -->
			<div class="sc-feature" use:inView style="transition-delay:.3s">
				<div class="sc-feature-header">
					<div class="sc-feature-icon sc-icon-violet">
						<Paintbrush class="w-5 h-5" />
					</div>
					<div>
						<h3 class="sc-feature-title">Concept Art</h3>
						<p class="sc-feature-sub">Full-scene illustrations from a text prompt — with 9 style presets and restyle mode.</p>
					</div>
				</div>
				<div class="sc-concept-wrap">
					<div class="sc-concept-grid">
						{#each [
							{ style: 'Painterly', gradient: 'linear-gradient(135deg, #2d1b69, #7c3aed, #a78bfa)', emoji: '' },
							{ style: 'Anime', gradient: 'linear-gradient(135deg, #db2777, #f472b6, #fda4af)', emoji: '' },
							{ style: 'Pixel Art', gradient: 'linear-gradient(135deg, #065f46, #10b981, #6ee7b7)', emoji: '' },
							{ style: 'Sci-Fi', gradient: 'linear-gradient(135deg, #0c4a6e, #0284c7, #38bdf8)', emoji: '' },
							{ style: 'Fantasy', gradient: 'linear-gradient(135deg, #78350f, #d97706, #fbbf24)', emoji: '' },
							{ style: 'Watercolor', gradient: 'linear-gradient(135deg, #1e3a5f, #5eacde, #a3d5ef)', emoji: '' },
						] as preset}
							<div class="sc-concept-card">
								<div class="sc-concept-preview" style="background:{preset.gradient}">
									<div class="sc-concept-noise"></div>
								</div>
								<span class="sc-concept-label">{preset.style}</span>
							</div>
						{/each}
					</div>
					<div class="sc-concept-features">
						<span class="sc-concept-pill">9 style presets</span>
						<span class="sc-concept-pill">5 aspect ratios</span>
						<span class="sc-concept-pill">Reference image support</span>
						<span class="sc-concept-pill">Restyle mode</span>
					</div>
				</div>
			</div>

		</div>
	</section>

	<!-- Pricing -->
	<section id="pricing" class="section pricing-section">
		<div class="container">
			<div class="section-head" use:inView>
				<span class="tag">Pricing</span>
				<h2 class="section-title">Pay for what you use</h2>
				<p class="section-sub">No subscriptions. Tokens never expire. Failed generations refunded automatically.</p>
			</div>

			<div class="free-box" use:inView style="transition-delay:.06s">
				<div class="free-pill">
					<Sparkles class="w-3.5 h-3.5" />
					Free to start
				</div>
				<h3>Try 3 sprites free, no signup required</h3>
				<p>Create an account to unlock 50 bonus tokens, textures &amp; rotations.</p>
			</div>

			<div class="price-grid">
				<div class="price-card" use:inView style="transition-delay:.1s">
					<div class="price-head">
						<h3>Starter</h3>
						<span class="price-equiv">~100 sprites</span>
					</div>
					<div class="price-amount">
						<span class="price-dollar">$10</span>
						<span class="price-tokens">300 tokens</span>
					</div>
					<p class="price-per">$0.033 per token</p>
					<a href={data.user ? '/app/billing' : '/login'} class="price-btn">Buy tokens</a>
				</div>

				<div class="price-card price-card-pop" use:inView style="transition-delay:.2s">
					<div class="price-pop-badge">Best Value</div>
					<div class="price-head">
						<h3>Creator</h3>
						<span class="price-equiv">~400 sprites</span>
					</div>
					<div class="price-amount">
						<span class="price-dollar">$25</span>
						<span class="price-tokens">1,200 tokens</span>
					</div>
					<p class="price-per price-per-gold">$0.021 per token — 37% off</p>
					<a href={data.user ? '/app/billing' : '/login'} class="price-btn price-btn-gold">Buy tokens</a>
				</div>

				<div class="price-card" use:inView style="transition-delay:.3s">
					<div class="price-head">
						<h3>Studio</h3>
						<span class="price-equiv">~1,000 sprites</span>
					</div>
					<div class="price-amount">
						<span class="price-dollar">$50</span>
						<span class="price-tokens">3,000 tokens</span>
					</div>
					<p class="price-per price-per-green">$0.017 per token — 50% off</p>
					<a href={data.user ? '/app/billing' : '/login'} class="price-btn">Buy tokens</a>
				</div>
			</div>

			<div class="token-strip" use:inView style="transition-delay:.12s">
				<div class="token-chip">
					<Sparkles class="w-5 h-5" style="color:#fbbf24" />
					<div><strong>3 tokens</strong><span>per sprite</span></div>
				</div>
				<div class="token-sep" aria-hidden="true"></div>
				<div class="token-chip">
					<Layers class="w-5 h-5" style="color:#22d3ee" />
					<div><strong>4 tokens</strong><span>per texture set</span></div>
				</div>
				<div class="token-sep" aria-hidden="true"></div>
				<div class="token-chip">
					<RotateCw class="w-5 h-5" style="color:#fb923c" />
					<div><strong>6 tokens</strong><span>per 8-dir rotation</span></div>
				</div>
				<div class="token-sep" aria-hidden="true"></div>
				<div class="token-chip">
					<Paintbrush class="w-5 h-5" style="color:#a78bfa" />
					<div><strong>4 tokens</strong><span>per concept art</span></div>
				</div>
				</div>
		</div>
	</section>

	<!-- Final CTA -->
	<section class="section cta-section">
		<div class="cta-box" use:inView>
			<h2 class="cta-title">Ready to create?</h2>
			<p class="cta-sub">Join thousands of game developers already using GenSprite.</p>
			<a href="/app" class="btn-primary btn-lg">
				{#if data.user}
					Generate
				{:else}
					Start generating — it's free
				{/if}
				<ArrowRight class="w-5 h-5" />
			</a>
		</div>
	</section>

	<Footer />
</div>

<style>
	/* ===== Fonts ===== */
	.landing { font-family: 'DM Sans', system-ui, sans-serif; }
	.hero-title, .hero-accent, .section-title, .feat-name,
	.step h3, .step-num, .price-dollar, .cta-title,
	.price-head h3 {
		font-family: 'Syne', system-ui, sans-serif;
	}

	/* ===== Background ===== */
	.bg-layer {
		position: fixed; inset: 0; z-index: 0; pointer-events: none;
	}
	.orb {
		position: absolute; border-radius: 50%; filter: blur(130px);
	}
	.orb-1 {
		width: 650px; height: 650px; background: #f59e0b; opacity: .12;
		top: -250px; left: -120px; animation: drift 22s ease-in-out infinite;
	}
	.orb-2 {
		width: 550px; height: 550px; background: #f97316; opacity: .1;
		bottom: -200px; right: -100px; animation: drift 26s ease-in-out infinite reverse;
	}
	.orb-3 {
		width: 420px; height: 420px; background: #06b6d4; opacity: .06;
		top: 45%; right: 8%; animation: drift 24s ease-in-out infinite 4s;
	}
	.dot-grid {
		position: absolute; inset: 0;
		background-image: radial-gradient(rgba(255,255,255,.04) 1px, transparent 1px);
		background-size: 28px 28px;
	}

	/* ===== Keyframes ===== */
	@keyframes drift {
		0%,100% { transform: translate(0,0); }
		33% { transform: translate(25px,-18px); }
		66% { transform: translate(-18px,25px); }
	}
	@keyframes revealUp {
		from { opacity: 0; transform: translateY(28px); }
		to   { opacity: 1; transform: translateY(0); }
	}
	@keyframes bob {
		0%,100% { transform: translateY(0); }
		50%     { transform: translateY(-14px); }
	}
	@keyframes shimmer {
		0%,100% { background-position: 0% center; }
		50%     { background-position: 100% center; }
	}

	/* ===== Hero reveal (auto-play) ===== */
	.hero-reveal {
		animation: revealUp .75s cubic-bezier(.16,1,.3,1) both;
	}

	/* ===== Scroll reveal ===== */
	.reveal, :global(.reveal) {
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1);
	}
	:global(.in-view) {
		opacity: 1; transform: translateY(0);
	}

	/* We apply via use:inView which adds in-view class */
	:global([style*="transition-delay"]) {
		/* ensure delay is honoured */
	}

	/* ===== OIIA Bar ===== */
	.oiia-bar {
		position: relative; z-index: 10;
		border-bottom: 1px solid rgba(168,85,247,.18);
		background: linear-gradient(90deg, rgba(168,85,247,.06), rgba(236,72,153,.06), rgba(168,85,247,.06));
	}
	.oiia-link {
		display: flex; align-items: center; justify-content: center; gap: .75rem;
		max-width: 72rem; margin: 0 auto; padding: .6rem 1rem;
		font-size: .8125rem; color: #a1a1aa; text-decoration: none;
		transition: color .2s;
	}
	.oiia-link:hover { color: #d4d4d8; }
	.oiia-link strong { color: #fff; }
	.oiia-badge {
		display: inline-flex; align-items: center; gap: .3rem;
		padding: .1rem .45rem; border-radius: 9999px;
		background: rgba(168,85,247,.15); border: 1px solid rgba(168,85,247,.25);
		color: #c084fc; font-size: .6875rem; font-weight: 600;
	}
	.oiia-arrow { color: #a78bfa; transition: transform .2s; }
	.oiia-link:hover .oiia-arrow { transform: translateX(2px); }

	/* ===== Hero ===== */
	.hero {
		position: relative; z-index: 10;
		padding: 5rem 1rem 3.5rem;
		min-height: min(82vh, 680px);
		display: flex; flex-direction: column; align-items: center; justify-content: center;
	}
	.hero-inner {
		position: relative; z-index: 10;
		text-align: center; max-width: 44rem; margin: 0 auto;
	}
	.hero-title {
		font-weight: 800; font-size: clamp(2.4rem,5.8vw,4.25rem);
		line-height: 1.06; color: #fff; letter-spacing: -.025em;
		margin-bottom: 1.25rem;
	}
	.hero-accent {
		display: block;
		background: linear-gradient(135deg, #fbbf24, #f59e0b, #f97316, #f59e0b, #fbbf24);
		background-size: 200% auto;
		-webkit-background-clip: text; background-clip: text;
		-webkit-text-fill-color: transparent;
		animation: shimmer 4s ease-in-out infinite;
	}
	.hero-sub {
		font-size: 1.0625rem; color: #a1a1aa; line-height: 1.7;
		max-width: 30rem; margin: 0 auto 2.25rem;
	}
	.hero-ctas {
		display: flex; align-items: center; justify-content: center;
		gap: .75rem; flex-wrap: wrap;
	}

	/* ===== Buttons ===== */
	.btn-primary {
		display: inline-flex; align-items: center; gap: .5rem;
		padding: .8rem 1.75rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-weight: 600; font-size: .9rem;
		border-radius: .7rem; text-decoration: none;
		box-shadow: 0 0 28px rgba(245,158,11,.18);
		transition: box-shadow .25s, transform .25s;
	}
	.btn-primary:hover {
		box-shadow: 0 0 36px rgba(245,158,11,.32);
		transform: translateY(-1px);
	}
	.btn-lg { padding: .9rem 2.25rem; font-size: .95rem; }
	.btn-ghost {
		display: inline-flex; align-items: center; gap: .5rem;
		padding: .8rem 1.75rem; color: #a1a1aa; font-weight: 500;
		font-size: .9rem; text-decoration: none; transition: color .2s;
	}
	.btn-ghost:hover { color: #fff; }

	/* ===== Floating sprites (desktop) ===== */
	.sprites-constellation { display: none; }

	@media (min-width: 768px) {
		.sprites-constellation {
			display: block; position: absolute; inset: 0; z-index: 1;
			pointer-events: none;
		}
	}
	.sprite-float {
		position: absolute; pointer-events: auto;
	}
	.sprite-float img {
		width: 100%; height: 100%; object-fit: contain;
		filter: drop-shadow(0 0 18px rgba(245,158,11,.18));
		transition: transform .4s cubic-bezier(.16,1,.3,1);
	}
	.sprite-float:hover img { transform: scale(1.18) rotate(-2deg); }

	.sprite-fl-1 { top: 8%; left: 6%; width: 120px; height: 120px; animation: bob 5.2s ease-in-out infinite; }
	.sprite-fl-2 { top: 4%; right: 5%; width: 105px; height: 105px; animation: bob 6s ease-in-out infinite .6s; }
	.sprite-fl-3 { top: 50%; left: 3%; width: 95px; height: 95px; animation: bob 5.6s ease-in-out infinite 1.2s; }
	.sprite-fl-4 { top: 48%; right: 4%; width: 115px; height: 115px; animation: bob 6.4s ease-in-out infinite 1.8s; }
	.sprite-fl-5 { bottom: 6%; left: 9%; width: 88px; height: 88px; animation: bob 5.8s ease-in-out infinite 2.4s; }
	.sprite-fl-6 { top: 28%; right: 9%; width: 100px; height: 100px; animation: bob 6.2s ease-in-out infinite 3s; }

	.sprite-fl-2 img { filter: drop-shadow(0 0 18px rgba(168,85,247,.22)); }
	.sprite-fl-5 img { filter: drop-shadow(0 0 18px rgba(59,130,246,.2)); }

	@media (min-width: 1280px) {
		.sprite-fl-1 { width: 150px; height: 150px; left: 8%; }
		.sprite-fl-2 { width: 130px; height: 130px; right: 7%; }
		.sprite-fl-3 { width: 115px; height: 115px; left: 2%; }
		.sprite-fl-4 { width: 140px; height: 140px; right: 3%; }
		.sprite-fl-5 { width: 105px; height: 105px; left: 12%; }
		.sprite-fl-6 { width: 120px; height: 120px; right: 10%; }
	}

	/* ===== Mobile sprite grid ===== */
	.sprites-mobile {
		display: grid; grid-template-columns: repeat(3,1fr); gap: .85rem;
		max-width: 22rem; margin: 2.5rem auto 0; padding: 0 1rem;
	}
	@media (min-width: 768px) { .sprites-mobile { display: none; } }
	.sprite-cell {
		aspect-ratio: 1; padding: .6rem;
		background: rgba(245,158,11,.04);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .85rem;
		display: flex; align-items: center; justify-content: center;
	}
	.sprite-cell img {
		width: 100%; height: 100%; object-fit: contain;
		filter: drop-shadow(0 0 10px rgba(245,158,11,.12));
	}

	/* ===== Shared section ===== */
	.section { position: relative; z-index: 10; padding: 5.5rem 0; }
	.container { max-width: 72rem; margin: 0 auto; padding: 0 1rem; }
	.section-head { text-align: center; margin-bottom: 3rem; }
	.tag {
		display: inline-block; font-size: .7rem; font-weight: 600;
		text-transform: uppercase; letter-spacing: .09em;
		color: #f59e0b; background: rgba(245,158,11,.08);
		border: 1px solid rgba(245,158,11,.18);
		padding: .2rem .65rem; border-radius: 9999px; margin-bottom: .85rem;
	}
	.section-title {
		font-weight: 700; font-size: clamp(1.65rem,3.8vw,2.35rem);
		color: #fff; letter-spacing: -.01em; margin-bottom: .6rem;
	}
	.section-sub { color: #71717a; font-size: .95rem; max-width: 26rem; margin: 0 auto; }

	/* ===== Features ===== */
	.features-section { border-top: 1px solid rgba(63,63,70,.25); }
	.features-grid {
		display: grid; grid-template-columns: 1fr; gap: 1.25rem;
	}
	@media (min-width: 640px) {
		.features-grid { grid-template-columns: repeat(2,1fr); }
	}
	@media (min-width: 1024px) {
		.features-grid { grid-template-columns: repeat(3,1fr); }
	}
	.feat-card {
		padding: 1.75rem; border-radius: 1.15rem;
		background: rgba(24,24,27,.55); backdrop-filter: blur(6px);
		border: 1px solid rgba(63,63,70,.35);
		transition: border-color .3s, box-shadow .3s, transform .3s;
		/* scroll reveal */
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1),
		            border-color .3s, box-shadow .3s;
	}
	:global(.feat-card.in-view) { opacity: 1; transform: translateY(0); }
	.feat-card:hover {
		border-color: rgba(245,158,11,.25);
		box-shadow: 0 0 0 1px rgba(245,158,11,.06), 0 8px 32px rgba(245,158,11,.07);
		transform: translateY(-3px);
	}
	:global(.feat-card.in-view:hover) { transform: translateY(-3px); }
	.feat-icon {
		width: 2.75rem; height: 2.75rem; border-radius: .65rem;
		display: flex; align-items: center; justify-content: center;
		margin-bottom: 1.1rem;
	}
	.feat-icon-amber  { background: rgba(245,158,11,.1);  color: #fbbf24; }
	.feat-icon-orange { background: rgba(249,115,22,.1);  color: #fb923c; }
	.feat-icon-cyan   { background: rgba(34,211,238,.1);  color: #22d3ee; }
	.feat-icon-violet { background: rgba(139,92,246,.1);  color: #a78bfa; }
	.feat-name {
		font-weight: 700; font-size: 1.05rem; color: #fff; margin-bottom: .5rem;
	}
	.feat-desc {
		font-size: .84rem; color: #a1a1aa; line-height: 1.65; margin-bottom: 1.1rem;
	}
	.feat-foot {
		display: flex; align-items: center; gap: .65rem;
		padding-top: .85rem; border-top: 1px solid rgba(63,63,70,.25);
	}
	.feat-cost {
		font-size: .72rem; font-weight: 600; color: #fbbf24;
		background: rgba(245,158,11,.08); padding: .15rem .45rem;
		border-radius: .3rem;
	}
	.feat-detail { font-size: .72rem; color: #52525b; }

	/* ===== Process ===== */
	.steps {
		display: flex; flex-direction: column; gap: 0;
		max-width: 38rem; margin: 0 auto;
	}
	@media (min-width: 768px) {
		.steps { flex-direction: row; align-items: flex-start; max-width: 100%; }
	}
	.step {
		flex: 1; text-align: center; padding: 1.25rem;
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1);
	}
	:global(.step.in-view) { opacity: 1; transform: translateY(0); }
	.step-num {
		font-weight: 800; font-size: 2.25rem; line-height: 1;
		color: rgba(245,158,11,.12); margin-bottom: .8rem; display: block;
	}
	.step h3 {
		font-weight: 700; font-size: .975rem; color: #fff; margin-bottom: .4rem;
	}
	.step p { font-size: .84rem; color: #71717a; line-height: 1.6; }
	.step-line { display: none; }
	@media (min-width: 768px) {
		.step-line {
			display: block; width: 1.75rem; height: 1px;
			background: rgba(63,63,70,.4); margin-top: 3rem; flex-shrink: 0;
		}
	}

	/* ===== Pricing ===== */
	.pricing-section { border-top: 1px solid rgba(63,63,70,.25); }
	.free-box {
		max-width: 34rem; margin: 0 auto 2.5rem; padding: 1.5rem;
		border-radius: .9rem; text-align: center;
		background: rgba(245,158,11,.03); border: 1px solid rgba(245,158,11,.12);
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1);
	}
	:global(.free-box.in-view) { opacity: 1; transform: translateY(0); }
	.free-pill {
		display: inline-flex; align-items: center; gap: .35rem;
		font-size: .72rem; font-weight: 600; color: #fbbf24;
		background: rgba(245,158,11,.08); border: 1px solid rgba(245,158,11,.16);
		padding: .2rem .55rem; border-radius: 9999px; margin-bottom: .7rem;
	}
	.free-box h3 {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 700; font-size: 1.15rem; color: #fff; margin-bottom: .3rem;
	}
	.free-box p { font-size: .84rem; color: #71717a; }

	.price-grid {
		display: grid; grid-template-columns: 1fr; gap: 1.25rem;
		max-width: 52rem; margin: 0 auto;
	}
	@media (min-width: 768px) {
		.price-grid { grid-template-columns: repeat(3,1fr); }
	}
	.price-card {
		padding: 1.75rem; border-radius: 1.15rem; position: relative;
		background: rgba(24,24,27,.45); border: 1px solid rgba(63,63,70,.35);
		transition: border-color .3s, transform .3s;
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1),
		            border-color .3s;
	}
	:global(.price-card.in-view) { opacity: 1; transform: translateY(0); }
	.price-card:hover { border-color: rgba(63,63,70,.55); transform: translateY(-2px); }
	:global(.price-card.in-view:hover) { transform: translateY(-2px); }
	.price-card-pop {
		background: rgba(245,158,11,.03); border-color: rgba(245,158,11,.22);
	}
	.price-card-pop:hover, :global(.price-card-pop.in-view:hover) {
		border-color: rgba(245,158,11,.38);
	}
	.price-pop-badge {
		position: absolute; top: -.55rem; left: 50%; transform: translateX(-50%);
		font-size: .65rem; font-weight: 600; color: #18181b;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		padding: .2rem .65rem; border-radius: 9999px;
	}
	.price-head h3 { font-weight: 700; font-size: 1.05rem; color: #fff; }
	.price-equiv { font-size: .72rem; color: #52525b; margin-top: .15rem; display: block; }
	.price-amount {
		display: flex; align-items: baseline; gap: .4rem;
		margin: 1.1rem 0 .35rem;
	}
	.price-dollar { font-weight: 800; font-size: 1.85rem; color: #fff; }
	.price-tokens { font-size: .84rem; color: #52525b; }
	.price-per { font-size: .72rem; color: #52525b; margin-bottom: 1.25rem; }
	.price-per-gold { color: #fbbf24; }
	.price-per-green { color: #4ade80; }
	.price-btn {
		display: block; text-align: center; padding: .55rem .85rem;
		background: rgba(63,63,70,.35); color: #fff;
		font-size: .84rem; font-weight: 500; border-radius: .65rem;
		text-decoration: none; transition: background .2s;
	}
	.price-btn:hover { background: rgba(63,63,70,.55); }
	.price-btn-gold {
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b; font-weight: 600;
		box-shadow: 0 0 20px rgba(245,158,11,.16);
	}
	.price-btn-gold:hover {
		box-shadow: 0 0 28px rgba(245,158,11,.3);
	}

	/* ===== Token strip ===== */
	.token-strip {
		display: flex; flex-direction: column; gap: .85rem;
		max-width: 34rem; margin: 2.5rem auto 0; padding: 1.25rem;
		background: rgba(24,24,27,.35); border: 1px solid rgba(63,63,70,.25);
		border-radius: .85rem;
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1);
	}
	:global(.token-strip.in-view) { opacity: 1; transform: translateY(0); }
	@media (min-width: 640px) {
		.token-strip { flex-direction: row; align-items: center; justify-content: center; }
	}
	.token-chip {
		display: flex; align-items: center; gap: .55rem; flex: 1; justify-content: center;
	}
	.token-chip div { display: flex; flex-direction: column; }
	.token-chip strong { font-size: .84rem; color: #fff; }
	.token-chip span { font-size: .72rem; color: #52525b; }
	.token-sep { display: none; }
	@media (min-width: 640px) {
		.token-sep { display: block; width: 1px; height: 1.75rem; background: rgba(63,63,70,.35); }
	}

	/* ===== CTA ===== */
	.cta-section { padding: 5rem 1rem; }
	.cta-box {
		text-align: center; max-width: 30rem; margin: 0 auto;
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1);
	}
	:global(.cta-box.in-view) { opacity: 1; transform: translateY(0); }
	.cta-title {
		font-weight: 800; font-size: clamp(1.65rem,3.8vw,2.35rem);
		color: #fff; margin-bottom: .6rem;
	}
	.cta-sub { color: #71717a; margin-bottom: 1.75rem; }

	/* ===== Showcase ===== */
	.showcase-section { border-top: 1px solid rgba(63,63,70,.25); }

	/* Feature blocks */
	.sc-feature {
		max-width: 52rem; margin: 0 auto 3rem;
		padding: 1.75rem;
		background: rgba(24,24,27,.45);
		border: 1px solid rgba(63,63,70,.3);
		border-radius: 1.15rem;
		opacity: 0; transform: translateY(22px);
		transition: opacity .65s cubic-bezier(.16,1,.3,1),
		            transform .65s cubic-bezier(.16,1,.3,1);
	}
	.sc-feature:last-child { margin-bottom: 0; }
	:global(.sc-feature.in-view) { opacity: 1; transform: translateY(0); }

	.sc-feature-header {
		display: flex; align-items: flex-start; gap: .85rem;
		margin-bottom: 1.5rem;
	}
	.sc-feature-icon {
		width: 2.5rem; height: 2.5rem; border-radius: .6rem;
		display: flex; align-items: center; justify-content: center;
		flex-shrink: 0;
	}
	.sc-icon-amber  { background: rgba(245,158,11,.1);  color: #fbbf24; }
	.sc-icon-orange { background: rgba(249,115,22,.1);  color: #fb923c; }
	.sc-icon-cyan   { background: rgba(34,211,238,.1);  color: #22d3ee; }
	.sc-icon-violet { background: rgba(139,92,246,.1);  color: #a78bfa; }
	.sc-feature-title {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 700; font-size: 1.05rem; color: #fff;
		margin-bottom: .2rem;
	}
	.sc-feature-sub { font-size: .84rem; color: #71717a; line-height: 1.5; }

	/* --- Sprite grid --- */
	.sc-sprites-grid {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: .85rem;
	}
	@media (min-width: 640px) {
		.sc-sprites-grid { grid-template-columns: repeat(6, 1fr); }
	}
	.sc-sprite-cell {
		display: flex; flex-direction: column; align-items: center; gap: .45rem;
	}
	.sc-sprite-cell img {
		aspect-ratio: 1; width: 100%; padding: .65rem;
		background: rgba(39,39,42,.4);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .85rem; object-fit: contain;
		filter: drop-shadow(0 0 10px rgba(245,158,11,.1));
		transition: border-color .3s, transform .3s;
	}
	.sc-sprite-cell:hover img {
		border-color: rgba(245,158,11,.25);
		transform: translateY(-3px);
	}
	.sc-sprite-label { font-size: .7rem; color: #52525b; font-weight: 500; }

	/* --- Rotation compass --- */
	.sc-rotation-wrap {
		display: flex; flex-direction: column; align-items: center; gap: 1.25rem;
	}
	.sc-rotation-compass {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: .5rem;
		width: 100%; max-width: 20rem;
	}
	.sc-rot-cell {
		aspect-ratio: 1; border-radius: .75rem; overflow: hidden;
		background: rgba(39,39,42,.35);
		border: 1px solid rgba(63,63,70,.35);
		display: flex; flex-direction: column;
		align-items: center; justify-content: center;
		position: relative;
		transition: border-color .3s;
	}
	.sc-rot-cell:hover { border-color: rgba(249,115,22,.25); }
	.sc-rot-center {
		border-color: rgba(249,115,22,.3);
		background: rgba(249,115,22,.04);
	}
	.sc-rot-input {
		width: 60%; height: 60%; object-fit: contain;
		filter: drop-shadow(0 0 10px rgba(249,115,22,.18));
		margin-bottom: 1rem;
	}
	.sc-rot-badge {
		position: absolute; bottom: .25rem;
		font-size: .55rem; font-weight: 600; color: #fb923c;
		background: rgba(249,115,22,.1); border: 1px solid rgba(249,115,22,.2);
		padding: .05rem .35rem; border-radius: 9999px;
	}
	.sc-rot-dir-img {
		width: 75%; height: 75%; object-fit: contain;
		filter: drop-shadow(0 0 8px rgba(249,115,22,.12));
	}
	.sc-rot-dir-label {
		position: absolute; bottom: .3rem;
		font-size: .55rem; font-weight: 600; color: #71717a;
	}
	.sc-rotation-note {
		text-align: center;
	}
	.sc-rotation-note p { font-size: .78rem; color: #52525b; max-width: 28rem; }

	/* --- PBR Textures --- */
	.sc-textures-wrap {
		display: flex; flex-direction: column; gap: 1.25rem;
	}
	.sc-textures-grid {
		display: grid; grid-template-columns: repeat(2, 1fr); gap: .75rem;
	}
	@media (min-width: 640px) {
		.sc-textures-grid { grid-template-columns: repeat(4, 1fr); }
	}
	.sc-tex-card {
		border-radius: .85rem; overflow: hidden;
		background: rgba(39,39,42,.35);
		border: 1px solid rgba(63,63,70,.35);
		transition: border-color .3s, transform .3s;
	}
	.sc-tex-card:hover {
		border-color: rgba(34,211,238,.25);
		transform: translateY(-2px);
	}
	.sc-tex-preview {
		aspect-ratio: 1; position: relative;
	}
	.sc-tex-noise {
		position: absolute; inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.15'/%3E%3C/svg%3E");
		background-size: cover;
		mix-blend-mode: overlay;
	}
	.sc-tex-info {
		padding: .6rem .75rem;
		display: flex; flex-direction: column; gap: .1rem;
	}
	.sc-tex-name { font-size: .78rem; font-weight: 600; color: #d4d4d8; }
	.sc-tex-desc { font-size: .65rem; color: #52525b; }
	.sc-textures-note { text-align: center; }
	.sc-textures-note p { font-size: .78rem; color: #52525b; max-width: 32rem; margin: 0 auto; }

	/* --- Concept Art --- */
	.sc-concept-wrap {
		display: flex; flex-direction: column; gap: 1.25rem;
	}
	.sc-concept-grid {
		display: grid; grid-template-columns: repeat(3, 1fr); gap: .65rem;
	}
	@media (min-width: 640px) {
		.sc-concept-grid { grid-template-columns: repeat(6, 1fr); }
	}
	.sc-concept-card {
		display: flex; flex-direction: column; gap: .35rem;
	}
	.sc-concept-preview {
		aspect-ratio: 3/4; border-radius: .7rem; position: relative; overflow: hidden;
		border: 1px solid rgba(63,63,70,.3);
		transition: border-color .3s, transform .3s;
	}
	.sc-concept-card:hover .sc-concept-preview {
		border-color: rgba(139,92,246,.3);
		transform: translateY(-2px);
	}
	.sc-concept-noise {
		position: absolute; inset: 0;
		background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.65' numOctaves='3' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)' opacity='.12'/%3E%3C/svg%3E");
		background-size: cover; mix-blend-mode: overlay;
	}
	.sc-concept-label {
		font-size: .65rem; color: #71717a; font-weight: 500; text-align: center;
	}
	.sc-concept-features {
		display: flex; flex-wrap: wrap; gap: .4rem; justify-content: center;
	}
	.sc-concept-pill {
		font-size: .65rem; font-weight: 500; color: #a78bfa;
		background: rgba(139,92,246,.08); border: 1px solid rgba(139,92,246,.18);
		padding: .15rem .5rem; border-radius: 9999px;
	}

	/* ===== Reduced motion ===== */
	@media (prefers-reduced-motion: reduce) {
		.hero-reveal { animation: none; opacity: 1; transform: none; }
		.sprite-float { animation: none; }
		.hero-accent { animation: none; }
		.orb { animation: none; }
		.feat-card, .step, .free-box, .price-card,
		.token-strip, .cta-box, .sc-feature {
			opacity: 1; transform: none; transition: none;
		}
	}
</style>
