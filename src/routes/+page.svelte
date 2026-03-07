<script lang="ts">
import {
	ArrowRight,
	Film,
	Layers,
	Paintbrush,
	RotateCw,
	Sparkles,
} from 'lucide-svelte';
import Footer from '$lib/components/Footer.svelte';
import Header from '$lib/components/Header.svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

const title =
	'GenSprite - One Sprite, 8 Directions in Seconds | AI Sprite Rotation';
const description =
	'Upload any character sprite and get all 8 cardinal directions instantly. No 3D modeling, no manual redrawing. Start free.';
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
				description: '3 free rotations, no signup required',
			},
			featureList: [
				'8-Direction Character Rotation',
				'Sprite Animation',
				'AI Sprite Generation',
				'PBR Texture Generation',
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

const ANIM_DIRECTIONS = ['south', 'southwest', 'west', 'northwest', 'north', 'northeast', 'east', 'southeast'] as const;
const ANIM_DIR_LABELS = ['S', 'SW', 'W', 'NW', 'N', 'NE', 'E', 'SE'] as const;
const ANIM_FRAME_COUNT = 19;
const ANIM_FPS = 16;

// Build frame paths: /showcase/animation/{dir}/0001.png .. 0019.png
function framePath(dir: string, frameIndex: number): string {
	return `/showcase/animation/${dir}/${String(frameIndex + 1).padStart(4, '0')}.png`;
}

let animFrame = $state(0);
let animInterval: ReturnType<typeof setInterval> | undefined;

function startAnimation() {
	if (animInterval) return;
	animInterval = setInterval(() => {
		animFrame = (animFrame + 1) % ANIM_FRAME_COUNT;
	}, 1000 / ANIM_FPS);
}

function stopAnimation() {
	if (animInterval) {
		clearInterval(animInterval);
		animInterval = undefined;
	}
}

$effect(() => {
	startAnimation();
	return () => stopAnimation();
});

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

	<!-- Promo Bar -->
	<div class="oiia-bar">
		<a href="/app/rotate" class="oiia-link">
			<span class="oiia-badge" style="background:rgba(249,115,22,.15);border-color:rgba(249,115,22,.25);color:#fb923c">
				<RotateCw class="w-3 h-3" />
				HOT
			</span>
			<span class="oiia-text">
				<strong>8-Direction Rotation</strong> — Upload a sprite, get all 8 directions instantly
			</span>
			<ArrowRight class="w-3.5 h-3.5 oiia-arrow" />
		</a>
	</div>

	<!-- Hero -->
	<section class="hero">
		<div class="hero-inner">
			<h1 class="hero-title hero-reveal">
				One sprite, 8 directions
				<span class="hero-accent">in seconds</span>
			</h1>
			<p class="hero-sub hero-reveal" style="animation-delay:.12s">
				Upload any character sprite and get all cardinal directions.
				No 3D modeling, no manual redrawing.
			</p>
			<div class="hero-ctas hero-reveal" style="animation-delay:.22s">
				<a href="/app/rotate" class="btn-primary">
					{#if data.user}
						Upload & Rotate
					{:else}
						Upload & Rotate FREE
					{/if}
					<ArrowRight class="w-4 h-4" />
				</a>
				<a href="/app" class="btn-ghost">Or generate a sprite first</a>
			</div>
		</div>

		<!-- Before/After: 1 sprite → 8 directions -->
		<div class="hero-rotation hero-reveal" style="animation-delay:.35s">
			<div class="hero-rot-flow">
				<!-- Input sprite -->
				<div class="hero-rot-input">
					<span class="hero-rot-label">Your sprite</span>
					<div class="hero-rot-input-img">
						<img src="/showcase/rotation/sprite_s.png" alt="Input sprite" />
					</div>
				</div>

				<!-- Arrow -->
				<div class="hero-rot-arrow">
					<ArrowRight class="w-6 h-6" />
				</div>

				<!-- 8-direction output grid -->
				<div class="hero-rot-output">
					<span class="hero-rot-label">8 directions</span>
					<div class="hero-rot-grid">
						{#each [
							{ dir: 'NW', src: '/showcase/rotation/sprite_nw.png' },
							{ dir: 'N', src: '/showcase/rotation/sprite_n.png' },
							{ dir: 'NE', src: '/showcase/rotation/sprite_ne.png' },
							{ dir: 'W', src: '/showcase/rotation/sprite_w.png' },
							{ dir: 'E', src: '/showcase/rotation/sprite_e.png' },
							{ dir: 'SW', src: '/showcase/rotation/sprite_sw.png' },
							{ dir: 'S', src: '/showcase/rotation/sprite_s.png' },
							{ dir: 'SE', src: '/showcase/rotation/sprite_se.png' },
						] as cell}
							<div class="hero-rot-cell">
								<img src={cell.src} alt="{cell.dir} direction" />
								<span class="hero-rot-dir">{cell.dir}</span>
							</div>
						{/each}
					</div>
				</div>
			</div>
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

				<div class="feat-card" use:inView style="transition-delay:.11s">
					<div class="feat-icon feat-icon-rose">
						<Film class="w-6 h-6" />
					</div>
					<h3 class="feat-name">Sprite Animation</h3>
					<p class="feat-desc">
						Animate your sprites in all directions. Powered by Wan 2.2 motion transfer with automatic background removal and spritesheet export.
					</p>
					<div class="feat-foot">
						<span class="feat-cost">Dynamic</span>
						<span class="feat-detail">Walk, run &mdash; 4 or 8 directions</span>
					</div>
				</div>

				<div class="feat-card" use:inView style="transition-delay:.17s">
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

				<div class="feat-card" use:inView style="transition-delay:.23s">
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

				<div class="feat-card" use:inView style="transition-delay:.29s">
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
				<h2 class="section-title">Upload. Rotate. Ship.</h2>
			</div>

			<div class="steps">
				<div class="step" use:inView style="transition-delay:.06s">
					<span class="step-num">01</span>
					<h3>Upload your sprite</h3>
					<p>Drag & drop any front-facing character sprite. PNG, JPEG, or WebP.</p>
				</div>
				<div class="step-line" aria-hidden="true"></div>
				<div class="step" use:inView style="transition-delay:.16s">
					<span class="step-num">02</span>
					<h3>AI rotates it</h3>
					<p>SV3D reconstructs your character from every angle with ControlNet refinement.</p>
				</div>
				<div class="step-line" aria-hidden="true"></div>
				<div class="step" use:inView style="transition-delay:.26s">
					<span class="step-num">03</span>
					<h3>Download all 8</h3>
					<p>Get all 8 directions as transparent PNGs or a spritesheet — game-ready.</p>
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

			<!-- 8-Direction Rotation (Primary) -->
			<div class="sc-feature" use:inView style="transition-delay:.06s">
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

			<!-- Sprite Animation -->
			<div class="sc-feature" use:inView style="transition-delay:.10s">
				<div class="sc-feature-header">
					<div class="sc-feature-icon sc-icon-rose">
						<Film class="w-5 h-5" />
					</div>
					<div>
						<h3 class="sc-feature-title">Sprite Animation</h3>
						<p class="sc-feature-sub">Upload direction sprites, get animated spritesheets via Wan 2.2 motion transfer.</p>
					</div>
				</div>
				<div class="sc-animation-wrap">
					<div class="sc-anim-grid">
						{#each ANIM_DIRECTIONS as dir, i}
							<div class="sc-anim-dir-cell">
								<div class="sc-anim-canvas">
									{#each { length: ANIM_FRAME_COUNT } as _, f}
										<img
											src={framePath(dir, f)}
											alt="{ANIM_DIR_LABELS[i]} frame {f + 1}"
											class="sc-anim-sprite"
											class:sc-anim-active={f === animFrame}
											loading="lazy"
										/>
									{/each}
								</div>
								<span class="sc-anim-dir-label">{ANIM_DIR_LABELS[i]}</span>
							</div>
						{/each}
					</div>
					<div class="sc-animation-note">
						<p>Each direction animated independently at {ANIM_FPS} fps with automatic background removal and PNG frame export.</p>
					</div>
				</div>
			</div>

			<!-- Sprite Generation -->
			<div class="sc-feature" use:inView style="transition-delay:.14s">
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

	<!-- Final CTA -->
	<section class="section cta-section">
		<div class="cta-box" use:inView>
			<h2 class="cta-title">Ready to rotate?</h2>
			<p class="cta-sub">Upload your sprite and get all 8 directions in seconds.</p>
			<a href="/app/rotate" class="btn-primary btn-lg">
				{#if data.user}
					Upload & Rotate
				{:else}
					Try free — no signup
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

	/* ===== Hero Rotation Demo ===== */
	.hero-rotation {
		max-width: 52rem; margin: 0 auto;
		padding: 0 1rem;
	}
	.hero-rot-flow {
		display: flex; align-items: center; justify-content: center;
		gap: 1.5rem; flex-wrap: wrap;
	}
	@media (min-width: 768px) {
		.hero-rot-flow { flex-wrap: nowrap; gap: 2rem; }
	}
	.hero-rot-input {
		display: flex; flex-direction: column; align-items: center; gap: .65rem;
		flex-shrink: 0;
	}
	.hero-rot-input-img {
		width: 120px; height: 120px;
		background: rgba(249,115,22,.04);
		border: 2px solid rgba(249,115,22,.25);
		border-radius: 1rem;
		display: flex; align-items: center; justify-content: center;
		padding: .75rem;
		transition: border-color .3s;
	}
	.hero-rot-input-img:hover { border-color: rgba(249,115,22,.45); }
	.hero-rot-input-img img {
		width: 100%; height: 100%; object-fit: contain;
		filter: drop-shadow(0 0 12px rgba(249,115,22,.2));
	}
	@media (min-width: 768px) {
		.hero-rot-input-img { width: 140px; height: 140px; }
	}
	.hero-rot-label {
		font-size: .7rem; font-weight: 600; text-transform: uppercase;
		letter-spacing: .06em; color: #71717a;
	}
	.hero-rot-arrow {
		color: #52525b; flex-shrink: 0;
		animation: pulseRight 2s ease-in-out infinite;
	}
	@keyframes pulseRight {
		0%,100% { transform: translateX(0); opacity: .5; }
		50% { transform: translateX(4px); opacity: 1; }
	}
	.hero-rot-output {
		display: flex; flex-direction: column; align-items: center; gap: .65rem;
	}
	.hero-rot-grid {
		display: grid; grid-template-columns: repeat(4, 1fr); gap: .45rem;
	}
	@media (min-width: 640px) {
		.hero-rot-grid { gap: .55rem; }
	}
	.hero-rot-cell {
		width: 64px; height: 64px;
		background: rgba(39,39,42,.35);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: .6rem;
		display: flex; align-items: center; justify-content: center;
		position: relative;
		transition: border-color .3s, transform .3s;
	}
	.hero-rot-cell:hover {
		border-color: rgba(249,115,22,.3);
		transform: translateY(-2px);
	}
	.hero-rot-cell img {
		width: 80%; height: 80%; object-fit: contain;
		filter: drop-shadow(0 0 6px rgba(249,115,22,.12));
	}
	.hero-rot-dir {
		position: absolute; bottom: .15rem;
		font-size: .5rem; font-weight: 600; color: #52525b;
	}
	@media (min-width: 768px) {
		.hero-rot-cell { width: 76px; height: 76px; }
	}
	@media (min-width: 1024px) {
		.hero-rot-cell { width: 88px; height: 88px; }
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
	.feat-icon-rose   { background: rgba(244,63,94,.1);   color: #fb7185; }
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
	.sc-icon-rose   { background: rgba(244,63,94,.1);   color: #fb7185; }
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

	/* --- Animation showcase --- */
	.sc-animation-wrap {
		display: flex; flex-direction: column; align-items: center; gap: 1.5rem;
	}
	.sc-anim-grid {
		display: grid; grid-template-columns: repeat(4, 1fr); gap: .5rem;
		width: 100%; max-width: 28rem;
	}
	@media (min-width: 640px) {
		.sc-anim-grid { gap: .65rem; max-width: 32rem; }
	}
	.sc-anim-dir-cell {
		display: flex; flex-direction: column; align-items: center; gap: .3rem;
	}
	.sc-anim-canvas {
		aspect-ratio: 1; width: 100%;
		border-radius: .75rem;
		background: rgba(39,39,42,.35);
		border: 1px solid rgba(63,63,70,.35);
		position: relative; overflow: hidden;
		transition: border-color .3s;
	}
	.sc-anim-dir-cell:hover .sc-anim-canvas {
		border-color: rgba(244,63,94,.3);
	}
	.sc-anim-sprite {
		position: absolute; inset: 8%; width: 84%; height: 84%;
		object-fit: contain;
		filter: drop-shadow(0 0 6px rgba(244,63,94,.1));
		opacity: 0;
		pointer-events: none;
	}
	.sc-anim-active {
		opacity: 1;
	}
	.sc-anim-dir-label {
		font-size: .6rem; font-weight: 600; color: #71717a;
	}
	.sc-animation-note { text-align: center; }
	.sc-animation-note p { font-size: .78rem; color: #52525b; max-width: 30rem; }

	/* ===== Reduced motion ===== */
	@media (prefers-reduced-motion: reduce) {
		.hero-reveal { animation: none; opacity: 1; transform: none; }
		.hero-rot-arrow { animation: none; opacity: 1; }
		.hero-accent { animation: none; }
		.orb { animation: none; }
		.feat-card, .step, .cta-box, .sc-feature {
			opacity: 1; transform: none; transition: none;
		}
	}
</style>
