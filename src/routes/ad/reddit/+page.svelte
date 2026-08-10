<script lang="ts">
	const title = 'GenSprite — Reddit Ad';
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
				Game Assets <span class="headline-glow">in Seconds</span>
			</h1>

			<!-- Prompt → Result flow -->
			<div class="flow">
				<!-- Prompt -->
				<div class="prompt-card">
					<div class="prompt-label">Prompt</div>
					<div class="prompt-text">
						"medieval knight with silver armor and blue cape"
					</div>
				</div>

				<!-- Arrow -->
				<div class="flow-arrow">
					<svg width="48" height="48" viewBox="0 0 48 48" fill="none">
						<path
							d="M8 24h28M28 16l8 8-8 8"
							stroke="url(#arrow-grad)"
							stroke-width="3"
							stroke-linecap="round"
							stroke-linejoin="round"
						/>
						<defs>
							<linearGradient id="arrow-grad" x1="8" y1="24" x2="36" y2="24">
								<stop stop-color="#fbbf24" />
								<stop offset="1" stop-color="#f97316" />
							</linearGradient>
						</defs>
					</svg>
				</div>

				<!-- Result -->
				<div class="result-card">
					<img src="/showcase/knight.png" alt="Generated knight sprite" />
					<div class="result-badge">PNG &middot; transparent</div>
				</div>
			</div>

			<!-- Bottom -->
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
		gap: 0;
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
		font-size: 72px;
		line-height: 1;
		color: #fff;
		letter-spacing: -0.03em;
		margin: 0 0 56px;
		text-align: center;
	}

	.headline-glow {
		background: linear-gradient(
			135deg,
			#fbbf24 0%,
			#f59e0b 40%,
			#f97316 70%,
			#fbbf24 100%
		);
		background-size: 200% auto;
		-webkit-background-clip: text;
		background-clip: text;
		-webkit-text-fill-color: transparent;
	}

	/* ===== Prompt → Result flow ===== */
	.flow {
		display: flex;
		align-items: center;
		gap: 36px;
		margin-bottom: 56px;
	}

	/* Prompt card */
	.prompt-card {
		width: 340px;
		padding: 24px 28px;
		background: rgba(24, 24, 27, 0.7);
		border: 1px solid rgba(63, 63, 70, 0.4);
		border-radius: 16px;
		backdrop-filter: blur(8px);
	}

	.prompt-label {
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.08em;
		color: #52525b;
		margin-bottom: 10px;
	}

	.prompt-text {
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 18px;
		line-height: 1.5;
		color: #e4e4e7;
		font-style: italic;
	}

	/* Arrow */
	.flow-arrow {
		flex-shrink: 0;
		opacity: 0.9;
	}

	/* Result card */
	.result-card {
		width: 300px;
		aspect-ratio: 1;
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.4);
		border-radius: 16px;
		overflow: hidden;
		position: relative;
		display: flex;
		align-items: center;
		justify-content: center;
		box-shadow: 0 0 60px rgba(245, 158, 11, 0.06);
	}

	.result-card img {
		width: 80%;
		height: 80%;
		object-fit: contain;
		filter: drop-shadow(0 0 30px rgba(245, 158, 11, 0.15));
	}

	.result-badge {
		position: absolute;
		bottom: 14px;
		left: 50%;
		transform: translateX(-50%);
		font-family: 'DM Sans', system-ui, sans-serif;
		font-size: 11px;
		font-weight: 500;
		color: #a1a1aa;
		background: rgba(0, 0, 0, 0.5);
		padding: 4px 12px;
		border-radius: 999px;
		backdrop-filter: blur(4px);
		white-space: nowrap;
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

	@media (prefers-reduced-motion: reduce) {
		.badge-dot {
			animation: none !important;
		}
	}
</style>
