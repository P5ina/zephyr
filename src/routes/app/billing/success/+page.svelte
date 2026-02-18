<script lang="ts">
import { ArrowLeft, CheckCircle, Coins } from 'lucide-svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

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
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="page-title">Payment Successful</h1>
	</div>

	<div class="success-content">
		<div class="success-card">
			<div class="success-icon">
				<CheckCircle class="w-12 h-12 text-green-400" />
			</div>
			<h2 class="success-heading">Thank you for your purchase!</h2>
			<p class="success-sub">
				Your tokens have been added to your account. You can start generating right away.
			</p>

			{#if balance !== null}
				<div class="balance-section">
					<div class="balance-badge">
						<Coins class="w-4 h-4 text-amber-400" />
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
	.success-page { max-width: 36rem; margin: 0 auto; }

	.page-header {
		display: flex; align-items: center; gap: .75rem;
		margin-bottom: 2rem;
	}
	.back-link {
		padding: .45rem;
		color: #71717a;
		border-radius: .5rem;
		transition: color .2s, background .2s;
	}
	.back-link:hover { color: #fff; background: rgba(63,63,70,.3); }
	.page-title {
		font-weight: 800; font-size: 1.35rem; color: #fff;
	}

	.success-content { display: flex; flex-direction: column; gap: 1.5rem; }

	.success-card {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		padding: 2.5rem 1.5rem;
		text-align: center;
		backdrop-filter: blur(6px);
	}

	.success-icon {
		margin-bottom: 1.25rem;
		display: flex; justify-content: center;
	}
	.success-heading {
		font-weight: 700; font-size: 1.25rem; color: #fff;
		margin-bottom: .5rem;
	}
	.success-sub {
		font-size: .875rem; color: #a1a1aa;
		max-width: 24rem; margin: 0 auto 1.5rem;
	}

	.balance-section { margin-bottom: 1.5rem; }
	.balance-badge {
		display: inline-flex; align-items: center; gap: .5rem;
		padding: .5rem 1rem;
		background: rgba(245,158,11,.06);
		border: 1px solid rgba(245,158,11,.15);
		border-radius: .6rem;
		font-size: .875rem;
	}
	.balance-label { color: #a1a1aa; }
	.balance-value {
		font-weight: 700; color: #fff;
		font-family: 'Syne', system-ui, sans-serif;
	}
	.balance-unit { color: #71717a; }

	.actions {
		display: flex; gap: .75rem;
		justify-content: center;
		flex-wrap: wrap;
	}
	.btn-primary {
		padding: .6rem 1.5rem;
		background: linear-gradient(135deg, #fbbf24, #f59e0b);
		color: #18181b;
		font-weight: 600; font-size: .875rem;
		border-radius: .6rem;
		transition: opacity .2s;
		text-decoration: none;
	}
	.btn-primary:hover { opacity: .9; }
	.btn-secondary {
		padding: .6rem 1.5rem;
		background: rgba(63,63,70,.3);
		color: #a1a1aa;
		font-weight: 500; font-size: .875rem;
		border-radius: .6rem;
		transition: background .2s, color .2s;
		text-decoration: none;
	}
	.btn-secondary:hover { background: rgba(63,63,70,.5); color: #fff; }
</style>
