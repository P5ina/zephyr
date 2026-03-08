<script lang="ts">
import {
	ArrowLeft,
	Clipboard,
	Check,
	Coins,
	Key,
	Loader2,
	Plus,
	ShieldX,
	History,
} from 'lucide-svelte';
import type { PageData } from './$types';

let { data }: { data: PageData } = $props();

let keys = $state(data.keys);
let transactions = $state(data.transactions);

let generating = $state(false);
let revoking = $state<string | null>(null);
let newKey = $state<string | null>(null);
let copied = $state(false);
let error = $state<string | null>(null);

async function generateKey() {
	generating = true;
	error = null;
	newKey = null;

	try {
		const res = await fetch('/api/dashboard/keys/generate', { method: 'POST' });
		const result = await res.json();
		if (!res.ok) {
			error = result.message || 'Failed to generate key';
			return;
		}
		newKey = result.key;
		// Mark all previous keys as revoked, add new one
		keys = keys.map((k) => ({ ...k, revokedAt: k.revokedAt || new Date() }));
		keys = [
			{
				id: result.id,
				keyPrefix: result.keyPrefix,
				createdAt: new Date(result.createdAt),
				lastUsedAt: null,
				revokedAt: null,
			},
			...keys,
		];
	} catch {
		error = 'Failed to generate key';
	} finally {
		generating = false;
	}
}

async function revokeKey(keyId: string) {
	revoking = keyId;
	error = null;

	try {
		const res = await fetch('/api/dashboard/keys/revoke', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ keyId }),
		});
		if (!res.ok) {
			const result = await res.json();
			error = result.message || 'Failed to revoke key';
			return;
		}
		keys = keys.map((k) =>
			k.id === keyId ? { ...k, revokedAt: new Date() } : k,
		);
		if (newKey) newKey = null;
	} catch {
		error = 'Failed to revoke key';
	} finally {
		revoking = null;
	}
}

function copyKey() {
	if (!newKey) return;
	navigator.clipboard.writeText(newKey);
	copied = true;
	setTimeout(() => (copied = false), 2000);
}

function formatDate(date: Date | string | null) {
	if (!date) return '—';
	return new Date(date).toLocaleDateString('en-US', {
		month: 'short',
		day: 'numeric',
		year: 'numeric',
		hour: '2-digit',
		minute: '2-digit',
	});
}

function actionLabel(action: string) {
	const labels: Record<string, string> = {
		generate_sprite: 'Generate Sprite',
		generate_tileset: 'Generate Tileset',
		agent_llm_call: 'Agent LLM Call',
		agent_asset_call: 'Agent Asset Call',
		agent_config_fetch: 'Agent Config Fetch',
	};
	return labels[action] || action;
}
</script>

<div class="dash-page">
	<div class="page-header">
		<a href="/app" class="back-link">
			<ArrowLeft class="w-5 h-5" />
		</a>
		<h1 class="page-title">Dashboard</h1>
	</div>

	<div class="dash-content">
		{#if error}
			<div class="error-banner">{error}</div>
		{/if}

		<!-- Credits Section -->
		<div class="panel">
			<div class="flex items-center gap-3 mb-4">
				<div class="icon-badge icon-badge-amber">
					<Coins class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Credits</h2>
					<p class="panel-sub">Your current balance</p>
				</div>
			</div>
			<div class="flex items-baseline gap-3">
				<span class="balance-number">{data.user.tokens + data.user.bonusTokens}</span>
				<span class="text-zinc-500">tokens</span>
				<a href="/app/billing" class="buy-link">Buy more</a>
			</div>
		</div>

		<!-- API Keys Section -->
		<div class="panel">
			<div class="flex items-center justify-between mb-5">
				<div class="flex items-center gap-3">
					<div class="icon-badge icon-badge-blue">
						<Key class="w-5 h-5" />
					</div>
					<div>
						<h2 class="panel-heading">API Keys</h2>
						<p class="panel-sub">Authenticate your agent with GenSprite</p>
					</div>
				</div>
				<button onclick={generateKey} disabled={generating} class="btn-generate">
					{#if generating}
						<Loader2 class="w-4 h-4 animate-spin" />
					{:else}
						<Plus class="w-4 h-4" />
					{/if}
					Generate new key
				</button>
			</div>

			{#if newKey}
				<div class="new-key-banner">
					<p class="new-key-warning">
						Copy your key now — it won't be shown again.
					</p>
					<div class="new-key-field">
						<input type="text" readonly value={newKey} class="key-input" />
						<button onclick={copyKey} class="btn-copy">
							{#if copied}
								<Check class="w-4 h-4" />
							{:else}
								<Clipboard class="w-4 h-4" />
							{/if}
						</button>
					</div>
				</div>
			{/if}

			{#if keys.length === 0}
				<p class="text-zinc-500 text-sm">No API keys yet. Generate one to get started.</p>
			{:else}
				<div class="keys-table-wrap">
					<table class="keys-table">
						<thead>
							<tr>
								<th>Key</th>
								<th>Created</th>
								<th>Last used</th>
								<th>Status</th>
								<th></th>
							</tr>
						</thead>
						<tbody>
							{#each keys as key}
								<tr>
									<td>
										<code class="key-prefix">{key.keyPrefix}...</code>
									</td>
									<td class="cell-date">{formatDate(key.createdAt)}</td>
									<td class="cell-date">{formatDate(key.lastUsedAt)}</td>
									<td>
										{#if key.revokedAt}
											<span class="status-badge status-revoked">Revoked</span>
										{:else}
											<span class="status-badge status-active">Active</span>
										{/if}
									</td>
									<td>
										{#if !key.revokedAt}
											<button
												onclick={() => revokeKey(key.id)}
												disabled={revoking === key.id}
												class="btn-revoke"
												title="Revoke key"
											>
												{#if revoking === key.id}
													<Loader2 class="w-3.5 h-3.5 animate-spin" />
												{:else}
													<ShieldX class="w-3.5 h-3.5" />
												{/if}
											</button>
										{/if}
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>

		<!-- Credit Usage History -->
		<div class="panel">
			<div class="flex items-center gap-3 mb-5">
				<div class="icon-badge icon-badge-green">
					<History class="w-5 h-5" />
				</div>
				<div>
					<h2 class="panel-heading">Usage History</h2>
					<p class="panel-sub">Recent credit transactions</p>
				</div>
			</div>

			{#if transactions.length === 0}
				<p class="text-zinc-500 text-sm">No usage yet.</p>
			{:else}
				<div class="keys-table-wrap">
					<table class="keys-table">
						<thead>
							<tr>
								<th>Date</th>
								<th>Action</th>
								<th>Credits</th>
							</tr>
						</thead>
						<tbody>
							{#each transactions as tx}
								<tr>
									<td class="cell-date">{formatDate(tx.createdAt)}</td>
									<td>
										<span class="action-label">{actionLabel(tx.action)}</span>
									</td>
									<td>
										<span class="credits-delta {tx.creditsDelta < 0 ? 'credits-neg' : 'credits-zero'}">
											{tx.creditsDelta === 0 ? '0' : tx.creditsDelta}
										</span>
									</td>
								</tr>
							{/each}
						</tbody>
					</table>
				</div>
			{/if}
		</div>
	</div>
</div>

<style>
	.dash-page { max-width: 56rem; margin: 0 auto; }

	.page-header {
		display: flex; align-items: center; gap: .75rem;
		margin-bottom: 1.5rem;
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

	.dash-content { display: flex; flex-direction: column; gap: 1.5rem; }

	.error-banner {
		padding: .85rem 1rem;
		background: rgba(239,68,68,.06);
		border: 1px solid rgba(239,68,68,.15);
		border-radius: .7rem;
		color: #f87171;
		font-size: .875rem;
	}

	.panel {
		background: rgba(24,24,27,.5);
		border: 1px solid rgba(63,63,70,.35);
		border-radius: 1rem;
		padding: 1.5rem;
		backdrop-filter: blur(6px);
	}
	.panel-heading { font-weight: 700; font-size: 1.05rem; color: #fff; }
	.panel-sub { font-size: .8125rem; color: #71717a; }

	.icon-badge {
		width: 2.5rem; height: 2.5rem;
		border-radius: .6rem;
		display: flex; align-items: center; justify-content: center;
	}
	.icon-badge-amber { background: rgba(245,158,11,.08); color: #fbbf24; }
	.icon-badge-green { background: rgba(74,222,128,.08); color: #4ade80; }
	.icon-badge-blue { background: rgba(96,165,250,.08); color: #60a5fa; }

	.balance-number {
		font-family: 'Syne', system-ui, sans-serif;
		font-weight: 800;
		font-size: 2.25rem;
		color: #fff;
	}

	.buy-link {
		font-size: .8125rem; font-weight: 500;
		color: #fbbf24; text-decoration: none;
		transition: color .2s;
	}
	.buy-link:hover { color: #f59e0b; }

	/* Generate button */
	.btn-generate {
		display: flex; align-items: center; gap: .4rem;
		padding: .5rem 1rem;
		border-radius: .55rem;
		background: rgba(96,165,250,.1);
		border: 1px solid rgba(96,165,250,.2);
		color: #60a5fa;
		font-size: .8125rem; font-weight: 500;
		cursor: pointer;
		transition: background .2s, border-color .2s;
	}
	.btn-generate:hover:not(:disabled) {
		background: rgba(96,165,250,.18);
		border-color: rgba(96,165,250,.35);
	}
	.btn-generate:disabled { opacity: .5; cursor: not-allowed; }

	/* New key banner */
	.new-key-banner {
		margin-bottom: 1.25rem;
		padding: 1rem;
		background: rgba(74,222,128,.04);
		border: 1px solid rgba(74,222,128,.15);
		border-radius: .7rem;
	}
	.new-key-warning {
		font-size: .8125rem; font-weight: 500;
		color: #4ade80; margin-bottom: .65rem;
	}
	.new-key-field {
		display: flex; gap: .5rem;
	}
	.key-input {
		flex: 1;
		padding: .5rem .75rem;
		background: rgba(9,9,11,.6);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .5rem;
		color: #fff;
		font-family: monospace;
		font-size: .8125rem;
		outline: none;
	}
	.btn-copy {
		padding: .5rem .65rem;
		background: rgba(63,63,70,.3);
		border: 1px solid rgba(63,63,70,.4);
		border-radius: .5rem;
		color: #a1a1aa;
		cursor: pointer;
		transition: background .2s, color .2s;
	}
	.btn-copy:hover { background: rgba(63,63,70,.5); color: #fff; }

	/* Keys table */
	.keys-table-wrap { overflow-x: auto; }
	.keys-table {
		width: 100%;
		border-collapse: collapse;
		font-size: .8125rem;
	}
	.keys-table th {
		text-align: left;
		padding: .5rem .75rem;
		color: #71717a;
		font-weight: 500;
		border-bottom: 1px solid rgba(63,63,70,.3);
	}
	.keys-table td {
		padding: .65rem .75rem;
		border-bottom: 1px solid rgba(63,63,70,.15);
		color: #d4d4d8;
	}
	.key-prefix {
		font-family: monospace;
		font-size: .8125rem;
		color: #a1a1aa;
		background: rgba(63,63,70,.2);
		padding: .15rem .4rem;
		border-radius: .3rem;
	}
	.cell-date {
		font-size: .75rem; color: #71717a;
		white-space: nowrap;
	}

	/* Status badges */
	.status-badge {
		display: inline-block;
		padding: .15rem .55rem;
		border-radius: 9999px;
		font-size: .6875rem;
		font-weight: 600;
	}
	.status-active {
		background: rgba(74,222,128,.1);
		color: #4ade80;
	}
	.status-revoked {
		background: rgba(113,113,122,.1);
		color: #71717a;
	}

	/* Revoke button */
	.btn-revoke {
		padding: .35rem;
		border-radius: .4rem;
		color: #71717a;
		cursor: pointer;
		background: none;
		border: none;
		transition: color .2s, background .2s;
	}
	.btn-revoke:hover:not(:disabled) {
		color: #f87171;
		background: rgba(239,68,68,.08);
	}
	.btn-revoke:disabled { opacity: .5; cursor: not-allowed; }

	/* Action labels */
	.action-label {
		font-size: .8125rem;
		color: #d4d4d8;
	}

	/* Credits delta */
	.credits-delta {
		font-family: monospace;
		font-weight: 600;
		font-size: .8125rem;
	}
	.credits-neg { color: #f87171; }
	.credits-zero { color: #71717a; }
</style>
