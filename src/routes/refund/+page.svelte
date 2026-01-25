<script lang="ts">
import Footer from '$lib/components/Footer.svelte';
import Header from '$lib/components/Header.svelte';
</script>

<svelte:head>
	<title>Refund Policy - GenSprite</title>
	<meta name="description" content="Refund Policy for GenSprite AI game asset generator" />
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<Header variant="simple" showBack showAuth={false} maxWidth="4xl" />

	<main class="max-w-4xl mx-auto px-4 py-12">
		<h1 class="text-3xl font-bold text-white mb-2">Refund Policy</h1>
		<p class="text-zinc-500 mb-8">Last updated: January 25, 2026</p>

		<div class="prose prose-invert prose-zinc max-w-none space-y-8">
			<section>
				<h2 class="text-xl font-semibold text-white mb-4">1. Overview</h2>
				<p class="text-zinc-400 leading-relaxed">
					GenSprite operates on a token-based system. This policy outlines when and how refunds are provided for token purchases and failed generations.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">2. Automatic Token Refunds</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>Tokens are automatically refunded to your account in the following cases:</p>
					<ul class="list-disc list-inside space-y-2 ml-4">
						<li><strong class="text-zinc-300">Failed generations:</strong> If an asset generation fails due to a system error, all tokens spent on that generation are automatically refunded.</li>
						<li><strong class="text-zinc-300">Cancelled generations:</strong> If you cancel a generation before it completes, tokens are refunded.</li>
						<li><strong class="text-zinc-300">Service errors:</strong> If our service experiences an error that prevents successful generation, tokens are refunded.</li>
					</ul>
					<p class="mt-3">
						Refunded tokens appear immediately in your account balance.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">3. Token Purchase Refunds</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>
						Token purchases are generally non-refundable as they represent digital goods that can be used immediately. However, we may provide refunds in the following circumstances:
					</p>
					<ul class="list-disc list-inside space-y-2 ml-4">
						<li><strong class="text-zinc-300">Duplicate charges:</strong> If you were accidentally charged multiple times for the same purchase</li>
						<li><strong class="text-zinc-300">Unauthorized purchases:</strong> If a purchase was made without your authorization</li>
						<li><strong class="text-zinc-300">Service unavailability:</strong> If you purchased tokens but the service was unavailable for an extended period</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">4. What Is Not Refundable</h2>
				<div class="text-zinc-400 leading-relaxed">
					<p>Refunds are not provided for:</p>
					<ul class="list-disc list-inside space-y-2 ml-4 mt-2">
						<li>Generations that completed successfully but did not meet your expectations</li>
						<li>Tokens used on generations that you are unsatisfied with</li>
						<li>Tokens remaining in accounts that are terminated for violations of our Terms of Service</li>
						<li>Free tokens provided upon signup</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">5. How to Request a Refund</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>To request a refund for a token purchase:</p>
					<ol class="list-decimal list-inside space-y-2 ml-4">
						<li>Email us at support@p5ina.dev</li>
						<li>Include your account email address</li>
						<li>Provide the transaction ID or date of purchase</li>
						<li>Explain the reason for your refund request</li>
					</ol>
					<p class="mt-3">
						We will review your request and respond within 5 business days.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">6. Refund Processing</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>
						If your refund request is approved:
					</p>
					<ul class="list-disc list-inside space-y-2 ml-4">
						<li>Refunds are processed through the original payment method</li>
						<li>Processing time depends on your payment provider (typically 5-10 business days)</li>
						<li>Any tokens from the refunded purchase will be removed from your account</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">7. Tokens Never Expire</h2>
				<p class="text-zinc-400 leading-relaxed">
					Purchased tokens never expire. You can use them at any time as long as your account is in good standing. This means there's no rush to use your tokens, and you won't lose them due to inactivity.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">8. Contact Us</h2>
				<p class="text-zinc-400 leading-relaxed">
					If you have questions about this Refund Policy or need assistance, please contact us at support@p5ina.dev.
				</p>
			</section>
		</div>
	</main>

	<Footer variant="simple" maxWidth="4xl" />
</div>
