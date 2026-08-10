<script lang="ts">
	import { ArrowLeft, CheckCircle, Coins } from 'lucide-svelte';

	let balance = $state<number | null>(null);
	let pollCount = $state(0);

	$effect(() => {
		// Poll for updated balance after webhook fires
		const interval = setInterval(async () => {
			if (pollCount >= 5) {
				clearInterval(interval);
				return;
			}
			pollCount++;
			try {
				const res = await fetch('/api/billing');
				if (res.ok) {
					const result = await res.json();
					balance = result.totalTokens;
				}
			} catch {
				// ignore
			}
		}, 2000);

		return () => clearInterval(interval);
	});
</script>

<div class="success-page">
	<div class="page-header">
		<a href="/app/billing" class="back-link">
			<ArrowLeft class="h-5 w-5" />
		</a>
		<h1 class="page-title">Payment Successful</h1>
	</div>

	<div class="success-content">
		<div class="success-card">
			<div class="success-icon">
				<CheckCircle class="h-12 w-12 text-green-400" />
			</div>
			<h2 class="success-heading">Thank you for your purchase!</h2>
			<p class="success-sub">
				Your tokens have been added to your account. You can start generating
				right away.
			</p>

			{#if balance !== null}
				<div class="balance-section">
					<div class="balance-badge">
						<Coins class="h-4 w-4 text-amber-400" />
						<span class="balance-label">Current balance:</span>
						<span class="balance-value">{balance}</span>
						<span class="balance-unit">tokens</span>
					</div>
				</div>
			{/if}

			<div class="actions">
				<a href="/app" class="btn-primary">Start Generating</a>
				<a href="/app/billing" class="btn-secondary">View Balance</a>
			</div>
		</div>
	</div>
</div>

<style>
	.success-page {
		max-width: 36rem;
		margin: 0 auto;
	}

	.page-header {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		margin-bottom: 2rem;
	}
	.back-link {
		padding: 0.45rem;
		color: #71717a;
		border-radius: 0.5rem;
		transition:
			color 0.2s,
			background 0.2s;
	}
	.back-link:hover {
		color: #fff;
		background: rgba(63, 63, 70, 0.3);
	}
	.page-title {
		font-weight: 800;
		font-size: 1.35rem;
		color: #fff;
	}

	.success-content {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
	}

	.success-card {
		background: rgba(24, 24, 27, 0.5);
		border: 1px solid rgba(63, 63, 70, 0.35);
		border-radius: 1rem;
		padding: 2.5rem 1.5rem;
		text-align: center;
		backdrop-filter: blur(6px);
	}

	.success-icon {
		margin-bottom: 1.25rem;
		display: flex;
		justify-content: center;
	}
	.success-heading {
		font-weight: 700;
		font-size: 1.25rem;
		color: #fff;
		margin-bottom: 0.5rem;
	}
	.success-sub {
		font-size: 0.875rem;
		color: #a1a1aa;
		max-width: 24rem;
		margin: 0 auto 1.5rem;
	}

	.balance-section {
		margin-bottom: 1.5rem;
	}
	.balance-badge {
		display: inline-flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.5rem 1rem;
		background: rgba(245, 158, 11, 0.06);
		border: 1px solid rgba(245, 158, 11, 0.15);
		border-radius: 0.6rem;
		font-size: 0.875rem;
	}
	.balance-label {
		color: #a1a1aa;
	}
	.balance-value {
		font-weight: 700;
		color: #fff;
		font-family: 'Syne', system-ui, sans-serif;
	}
	.balance-unit {
		color: #71717a;
	}

	.actions {
		display: flex;
		gap: 0.75rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.btn-primary {
		padding: 0.6rem 1.5rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600;
		font-size: 0.875rem;
		border-radius: 0.6rem;
		transition: opacity 0.2s;
		text-decoration: none;
	}
	.btn-primary:hover {
		opacity: 0.9;
	}
	.btn-secondary {
		padding: 0.6rem 1.5rem;
		background: rgba(63, 63, 70, 0.3);
		color: #a1a1aa;
		font-weight: 500;
		font-size: 0.875rem;
		border-radius: 0.6rem;
		transition:
			background 0.2s,
			color 0.2s;
		text-decoration: none;
	}
	.btn-secondary:hover {
		background: rgba(63, 63, 70, 0.5);
		color: #fff;
	}
</style>
