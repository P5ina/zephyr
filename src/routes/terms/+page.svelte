<script lang="ts">
	import Footer from '$lib/components/Footer.svelte';
	import Header from '$lib/components/Header.svelte';
</script>

<svelte:head>
	<title>Terms of Service - GenSprite</title>
	<meta
		name="description"
		content="Terms of Service for GenSprite AI game asset generator"
	/>
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<Header variant="simple" showBack showAuth={false} />

	<main class="mx-auto max-w-4xl px-4 py-12">
		<h1 class="mb-2 text-3xl font-bold text-white">Terms of Service</h1>
		<p class="mb-8 text-zinc-500">Last updated: January 25, 2026</p>

		<div class="prose prose-invert prose-zinc max-w-none space-y-8">
			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					1. Acceptance of Terms
				</h2>
				<p class="leading-relaxed text-zinc-400">
					By accessing or using GenSprite ("Service"), operated by Timur
					Turatbekov ("we", "us", or "our"), you agree to be bound by these
					Terms of Service. If you do not agree to these terms, please do not
					use the Service. We reserve the right to modify these terms at any
					time, and your continued use of the Service constitutes acceptance of
					any modifications.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					2. Description of Service
				</h2>
				<p class="leading-relaxed text-zinc-400">
					GenSprite is an AI-powered platform for generating game assets
					including sprites, PBR textures, and 8-directional character
					rotations. The Service operates on a token-based system where users
					purchase tokens to generate assets.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					3. Account Registration
				</h2>
				<p class="leading-relaxed text-zinc-400">
					To use the Service, you must create an account using GitHub OAuth. You
					are responsible for maintaining the security of your account and all
					activities that occur under your account. You must provide accurate
					information and promptly update any information to keep it accurate.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					4. Token System and Payments
				</h2>
				<div class="space-y-3 leading-relaxed text-zinc-400">
					<p>The Service uses a token-based payment system:</p>
					<ul class="ml-4 list-inside list-disc space-y-2">
						<li>New accounts receive 50 free tokens upon registration</li>
						<li>
							Additional tokens can be purchased in packs ($5, $15, or $35)
						</li>
						<li>
							Tokens are non-refundable once purchased, except as described in
							our Refund Policy
						</li>
						<li>Tokens never expire</li>
						<li>Tokens are deducted before generation begins</li>
						<li>Failed generations are automatically refunded</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">5. Acceptable Use</h2>
				<div class="space-y-3 leading-relaxed text-zinc-400">
					<p>You agree not to use the Service to:</p>
					<ul class="ml-4 list-inside list-disc space-y-2">
						<li>
							Generate content that is illegal, harmful, threatening, abusive,
							or violates any laws
						</li>
						<li>
							Generate content that infringes on intellectual property rights of
							others
						</li>
						<li>
							Attempt to circumvent any security measures or access restrictions
						</li>
						<li>Use automated systems to abuse or overload the Service</li>
						<li>Resell or redistribute the Service without authorization</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					6. Intellectual Property
				</h2>
				<div class="space-y-3 leading-relaxed text-zinc-400">
					<p>
						<strong class="text-zinc-300">Your Content:</strong> You retain ownership
						of the prompts you submit and the assets generated through the Service.
						You grant us a limited license to process your prompts for the purpose
						of generating assets.
					</p>
					<p>
						<strong class="text-zinc-300">Generated Assets:</strong> Assets generated
						through the Service are owned by you. You are free to use them for personal
						or commercial purposes without attribution.
					</p>
					<p>
						<strong class="text-zinc-300">Our Service:</strong> The Service, including
						its design, code, and underlying technology, remains our intellectual
						property.
					</p>
				</div>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					7. Service Availability
				</h2>
				<p class="leading-relaxed text-zinc-400">
					We strive to maintain high availability but do not guarantee
					uninterrupted access. The Service may be temporarily unavailable due
					to maintenance, updates, or circumstances beyond our control. We are
					not liable for any losses resulting from service interruptions.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">
					8. Limitation of Liability
				</h2>
				<p class="leading-relaxed text-zinc-400">
					The Service is provided "as is" without warranties of any kind. To the
					maximum extent permitted by law, we shall not be liable for any
					indirect, incidental, special, consequential, or punitive damages, or
					any loss of profits or revenues, whether incurred directly or
					indirectly.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">9. Termination</h2>
				<p class="leading-relaxed text-zinc-400">
					We reserve the right to suspend or terminate your account at any time
					for violations of these terms or for any other reason at our
					discretion. Upon termination, your right to use the Service ceases
					immediately. Unused tokens are non-refundable upon termination for
					cause.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">10. Governing Law</h2>
				<p class="leading-relaxed text-zinc-400">
					These terms shall be governed by and construed in accordance with
					applicable laws, without regard to conflict of law principles.
				</p>
			</section>

			<section>
				<h2 class="mb-4 text-xl font-semibold text-white">11. Contact</h2>
				<p class="leading-relaxed text-zinc-400">
					For questions about these Terms of Service, please contact us at
					timur@triangleint.com.
				</p>
			</section>
		</div>
	</main>

	<Footer variant="simple" maxWidth="4xl" />
</div>
