<script lang="ts">
	const title = 'GenSprite — Reddit Ad (Rotation)';

	const directions = [
		{ dir: 'NW', row: 1, col: 1, src: '/showcase/rotation/sprite_nw.png' },
		{ dir: 'N', row: 1, col: 2, src: '/showcase/rotation/sprite_n.png' },
		{ dir: 'NE', row: 1, col: 3, src: '/showcase/rotation/sprite_ne.png' },
		{ dir: 'W', row: 2, col: 1, src: '/showcase/rotation/sprite_w.png' },
		{ dir: '', row: 2, col: 2, src: '/showcase/rotation/sprite_s.png' },
		{ dir: 'E', row: 2, col: 3, src: '/showcase/rotation/sprite_e.png' },
		{ dir: 'SW', row: 3, col: 1, src: '/showcase/rotation/sprite_sw.png' },
		{ dir: 'S', row: 3, col: 2, src: '/showcase/rotation/sprite_s.png' },
		{ dir: 'SE', row: 3, col: 3, src: '/showcase/rotation/sprite_se.png' },
	];
</script>

<svelte:head>
	<title>{title}</title>
	<meta name="robots" content="noindex, nofollow" />
	<link
		href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="page-wrap">
	<div class="banner">
		<!-- Background -->
		<div class="bg" aria-hidden="true">
			<div class="bg-photo"></div>
			<div class="bg-darken"></div>
			<div class="vignette"></div>
		</div>

		<div class="content">
			<!-- Logo -->
			<div class="top-bar">
				<div class="logo">
					<img class="logo-mark" src="/icon-192.png" alt="" />
					<span class="logo-text">GenSprite</span>
				</div>
				<div class="badge-free">
					<span class="badge-dot"></span>
					50 free tokens
				</div>
			</div>

			<!-- Headline -->
			<h1 class="headline">
				One Sprite,<br />
				<span class="headline-glow">8 Directions</span>
			</h1>
			<p class="sub">
				Upload any sprite &mdash; get all 8 directions in seconds.
			</p>

			<!-- Rotation compass -->
			<div class="compass">
				{#each directions as cell (`${cell.row}-${cell.col}`)}
					<div
						class="compass-cell"
						class:compass-center={cell.dir === ''}
						style="grid-row:{cell.row};grid-column:{cell.col}"
					>
						{#if cell.dir === ''}
							<img src={cell.src} alt="Input sprite" class="compass-input" />
							<span class="compass-badge">Input</span>
						{:else}
							<img
								src={cell.src}
								alt="{cell.dir} rotation"
								class="compass-dir-img"
							/>
							<span class="compass-dir-label">{cell.dir}</span>
						{/if}
					</div>
				{/each}
			</div>

			<!-- Bottom CTA -->
			<div class="cta-area">
				<div class="cta-btn">
					Try Free — No Signup Required
					<svg viewBox="0 0 20 20" fill="currentColor" width="15" height="15">
						<path
							fill-rule="evenodd"
							d="M10.293 3.293a1 1 0 011.414 0l6 6a1 1 0 010 1.414l-6 6a1 1 0 01-1.414-1.414L14.586 11H3a1 1 0 110-2h11.586l-4.293-4.293a1 1 0 010-1.414z"
							clip-rule="evenodd"
						/>
					</svg>
				</div>
				<div class="cta-sub">
					Sprites &middot; PBR Textures &middot; 8-Dir Rotation &middot; Concept
					Art
				</div>
			</div>
		</div>
	</div>
</div>

<style>
	.page-wrap {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		background: #050507;
		padding: 2rem;
	}

	.banner {
		width: 1080px;
		height: 1080px;
		position: relative;
		overflow: hidden;
		background: #09090b;
		flex-shrink: 0;
	}

	@media (max-width: 1120px) {
		.banner {
			width: 100vw;
			height: 100vw;
			max-width: 1080px;
			max-height: 1080px;
		}
	}

	/* ===== Background ===== */
	.bg {
		position: absolute;
		inset: 0;
		pointer-events: none;
	}

	.bg-photo {
		position: absolute;
		inset: 0;
		background: url('/ad-bg.png') center/cover no-repeat;
		filter: blur(16px);
		transform: scale(1.1);
	}

	.bg-darken {
		position: absolute;
		inset: 0;
		background: rgba(0, 0, 0, 0.6);
	}

	.vignette {
		position: absolute;
		inset: 0;
		background: radial-gradient(
			ellipse at center,
			transparent 30%,
			rgba(0, 0, 0, 0.4) 100%
		);
	}

	/* ===== Content ===== */
	.content {
		position: relative;
		z-index: 10;
		width: 100%;
		height: 100%;
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		padding: 56px 64px;
	}

	/* ===== Top bar ===== */
	.top-bar {
		position: absolute;
		top: 48px;
		left: 56px;
		right: 56px;
		display: flex;
		align-items: center;
		justify-content: space-between;
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 12px;
	}

	.logo-mark {
		width: 40px;
		height: 40px;
		border-radius: 9px;
		object-fit: contain;
	}

	.logo-text {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 700;
		font-size: 23px;
		color: #fff;
	}

	.badge-free {
		display: flex;
		align-items: center;
		gap: 8px;
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 13px;
		font-weight: 600;
		color: #fbbf24;
		background: rgba(251, 191, 36, 0.06);
		border: 1px solid rgba(251, 191, 36, 0.15);
		padding: 7px 18px;
		border-radius: 999px;
	}

	.badge-dot {
		width: 7px;
		height: 7px;
		border-radius: 50%;
		background: #4ade80;
		box-shadow: 0 0 8px rgba(74, 222, 128, 0.5);
	}

	/* ===== Headline ===== */
	.headline {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800;
		font-size: 68px;
		line-height: 1;
		color: #fff;
		letter-spacing: -0.03em;
		margin: 0 0 16px;
		text-align: center;
	}

	.headline-glow {
		background: linear-gradient(
			135deg,
			#fb923c 0%,
			#f97316 40%,
			#f59e0b 70%,
			#fbbf24 100%
		);
		background-size: 200% auto;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	.sub {
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 18px;
		color: #a1a1aa;
		margin: 0 0 40px;
		text-align: center;
	}

	/* ===== Compass grid ===== */
	.compass {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		gap: 12px;
		width: 420px;
		margin-bottom: 40px;
	}

	.compass-cell {
		aspect-ratio: 1;
		border-radius: 14px;
		overflow: hidden;
		background: rgba(24, 24, 27, 0.6);
		border: 1px solid rgba(63, 63, 70, 0.4);
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		position: relative;
		backdrop-filter: blur(8px);
	}

	.compass-center {
		border-color: rgba(249, 115, 22, 0.35);
		background: rgba(249, 115, 22, 0.05);
		box-shadow: 0 0 30px rgba(249, 115, 22, 0.08);
	}

	.compass-input {
		width: 60%;
		height: 60%;
		object-fit: contain;
		filter: drop-shadow(0 0 14px rgba(249, 115, 22, 0.2));
		margin-bottom: 8px;
	}

	.compass-badge {
		position: absolute;
		bottom: 8px;
		font-size: 10px;
		font-weight: 600;
		font-family: 'DM Sans', system-ui, sans-serif;
		color: #fb923c;
		background: rgba(249, 115, 22, 0.1);
		border: 1px solid rgba(249, 115, 22, 0.2);
		padding: 2px 10px;
		border-radius: 999px;
	}

	.compass-dir-img {
		width: 72%;
		height: 72%;
		object-fit: contain;
		filter: drop-shadow(0 0 10px rgba(249, 115, 22, 0.12));
	}

	.compass-dir-label {
		position: absolute;
		bottom: 8px;
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 10px;
		font-weight: 600;
		color: #71717a;
	}

	/* ===== CTA ===== */
	.cta-area {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 16px;
	}

	.cta-btn {
		display: inline-flex;
		align-items: center;
		gap: 10px;
		padding: 16px 40px;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #0c0a09;
		font-family: 'DM Sans', system-ui, sans-serif;
		font-weight: 700;
		font-size: 17px;
		border-radius: 14px;
		box-shadow:
			0 0 40px rgba(251, 191, 36, 0.18),
			0 0 80px rgba(245, 158, 11, 0.06),
			inset 0 1px 0 rgba(255, 255, 255, 0.2);
	}

	.cta-sub {
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 14px;
		color: #52525b;
	}
</style>
