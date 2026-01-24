<script lang="ts">
import { ArrowLeft, Sparkles } from 'lucide-svelte';
</script>

<svelte:head>
	<title>Privacy Policy - Zephyr</title>
	<meta name="description" content="Privacy Policy for Zephyr AI game asset generator" />
</svelte:head>

<div class="min-h-screen bg-zinc-950">
	<nav class="border-b border-zinc-800/50">
		<div class="max-w-4xl mx-auto px-4 py-4 flex items-center gap-4">
			<a href="/" class="p-2 text-zinc-400 hover:text-white transition-colors">
				<ArrowLeft class="w-5 h-5" />
			</a>
			<div class="flex items-center gap-2">
				<div class="w-8 h-8 rounded-lg bg-gradient-to-br from-yellow-400 to-amber-500 flex items-center justify-center">
					<Sparkles class="w-4 h-4 text-zinc-900" />
				</div>
				<span class="text-xl font-bold text-white">Zephyr</span>
			</div>
		</div>
	</nav>

	<main class="max-w-4xl mx-auto px-4 py-12">
		<h1 class="text-3xl font-bold text-white mb-2">Privacy Policy</h1>
		<p class="text-zinc-500 mb-8">Last updated: January 25, 2025</p>

		<div class="prose prose-invert prose-zinc max-w-none space-y-8">
			<section>
				<h2 class="text-xl font-semibold text-white mb-4">1. Introduction</h2>
				<p class="text-zinc-400 leading-relaxed">
					Zephyr ("we", "our", or "us") respects your privacy and is committed to protecting your personal data. This Privacy Policy explains how we collect, use, and safeguard your information when you use our AI game asset generation service.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">2. Information We Collect</h2>
				<div class="text-zinc-400 leading-relaxed space-y-4">
					<div>
						<h3 class="text-lg font-medium text-zinc-300 mb-2">Account Information</h3>
						<p>When you sign up via GitHub OAuth, we collect:</p>
						<ul class="list-disc list-inside space-y-1 ml-4 mt-2">
							<li>Email address</li>
							<li>Username</li>
							<li>Profile picture URL</li>
							<li>GitHub user ID</li>
						</ul>
					</div>
					<div>
						<h3 class="text-lg font-medium text-zinc-300 mb-2">Usage Data</h3>
						<p>We automatically collect:</p>
						<ul class="list-disc list-inside space-y-1 ml-4 mt-2">
							<li>Generation prompts and parameters</li>
							<li>Generated asset metadata</li>
							<li>Token usage and transaction history</li>
							<li>Session data for authentication</li>
						</ul>
					</div>
					<div>
						<h3 class="text-lg font-medium text-zinc-300 mb-2">Payment Information</h3>
						<p>
							Payment processing is handled by Paddle. We do not store your credit card details. We receive confirmation of payment status and transaction IDs.
						</p>
					</div>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">3. How We Use Your Information</h2>
				<div class="text-zinc-400 leading-relaxed">
					<p>We use your information to:</p>
					<ul class="list-disc list-inside space-y-2 ml-4 mt-2">
						<li>Provide and maintain the Service</li>
						<li>Process your asset generation requests</li>
						<li>Manage your account and token balance</li>
						<li>Process payments and prevent fraud</li>
						<li>Communicate with you about your account or the Service</li>
						<li>Improve and optimize our Service</li>
						<li>Comply with legal obligations</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">4. Data Storage and Security</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>
						Your data is stored securely using industry-standard practices:
					</p>
					<ul class="list-disc list-inside space-y-2 ml-4">
						<li>Database hosted on Vercel Postgres (powered by Neon) with encryption at rest</li>
						<li>Generated assets stored on Vercel Blob with secure access controls</li>
						<li>All data transmitted over HTTPS</li>
						<li>Session tokens are securely hashed</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">5. Data Retention</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>We retain your data as follows:</p>
					<ul class="list-disc list-inside space-y-2 ml-4">
						<li><strong class="text-zinc-300">Account data:</strong> Until you request deletion</li>
						<li><strong class="text-zinc-300">Generated assets:</strong> Stored indefinitely unless you delete them</li>
						<li><strong class="text-zinc-300">Transaction records:</strong> Retained for 7 years for legal compliance</li>
						<li><strong class="text-zinc-300">Session data:</strong> Automatically expires after 30 days</li>
					</ul>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">6. Third-Party Services</h2>
				<div class="text-zinc-400 leading-relaxed space-y-3">
					<p>We use the following third-party services:</p>
					<ul class="list-disc list-inside space-y-2 ml-4">
						<li><strong class="text-zinc-300">GitHub:</strong> For authentication (OAuth)</li>
						<li><strong class="text-zinc-300">Paddle:</strong> For payment processing</li>
						<li><strong class="text-zinc-300">Vercel:</strong> For hosting, database, and file storage</li>
					</ul>
					<p class="mt-3">
						Each of these services has their own privacy policy. We encourage you to review them.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">7. Cookies</h2>
				<p class="text-zinc-400 leading-relaxed">
					We use essential cookies only for authentication and session management. We do not use tracking cookies or third-party analytics cookies.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">8. Your Rights</h2>
				<div class="text-zinc-400 leading-relaxed">
					<p>You have the right to:</p>
					<ul class="list-disc list-inside space-y-2 ml-4 mt-2">
						<li>Access your personal data</li>
						<li>Correct inaccurate data</li>
						<li>Request deletion of your data</li>
						<li>Export your data in a portable format</li>
						<li>Withdraw consent where applicable</li>
					</ul>
					<p class="mt-3">
						To exercise these rights, contact us at support@zephyr.p5ina.dev.
					</p>
				</div>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">9. Children's Privacy</h2>
				<p class="text-zinc-400 leading-relaxed">
					The Service is not intended for users under 13 years of age. We do not knowingly collect personal information from children under 13.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">10. Changes to This Policy</h2>
				<p class="text-zinc-400 leading-relaxed">
					We may update this Privacy Policy from time to time. We will notify you of any changes by posting the new policy on this page and updating the "Last updated" date.
				</p>
			</section>

			<section>
				<h2 class="text-xl font-semibold text-white mb-4">11. Contact Us</h2>
				<p class="text-zinc-400 leading-relaxed">
					For questions about this Privacy Policy, please contact us at support@zephyr.p5ina.dev.
				</p>
			</section>
		</div>
	</main>

	<footer class="border-t border-zinc-800/50 mt-12">
		<div class="max-w-4xl mx-auto px-4 py-8">
			<div class="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500">
				<a href="/terms" class="hover:text-white transition-colors">Terms of Service</a>
				<a href="/privacy" class="hover:text-white transition-colors">Privacy Policy</a>
				<a href="/refund" class="hover:text-white transition-colors">Refund Policy</a>
			</div>
		</div>
	</footer>
</div>
