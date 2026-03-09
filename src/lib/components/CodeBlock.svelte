<script lang="ts">
import { Check, Clipboard } from 'lucide-svelte';
import { createHighlighterCoreSync } from 'shiki/core';
import { createJavaScriptRegexEngine } from 'shiki/engine/javascript';
import langBash from 'shiki/langs/shellscript.mjs';
import langPython from 'shiki/langs/python.mjs';
import langTs from 'shiki/langs/typescript.mjs';
import langJson from 'shiki/langs/json.mjs';
import vitesseDark from 'shiki/themes/vitesse-dark.mjs';

const shiki = createHighlighterCoreSync({
	themes: [vitesseDark],
	langs: [langBash, langPython, langTs, langJson],
	engine: createJavaScriptRegexEngine(),
});

type Lang = 'bash' | 'python' | 'typescript' | 'json';
type MultiLang = 'bash' | 'python' | 'typescript';

interface Props {
	code: string | Record<MultiLang, string>;
	lang?: Lang;
	label?: string;
	selectedLang?: MultiLang;
	onLangChange?: (lang: MultiLang) => void;
}

let { code, lang = 'json', label, selectedLang, onLangChange }: Props = $props();

let copied = $state(false);

const isMultiLang = $derived(typeof code === 'object');
const activeLang = $derived(isMultiLang ? (selectedLang ?? 'bash') : lang);
const activeCode = $derived(isMultiLang ? (code as Record<string, string>)[activeLang] : (code as string));

const highlighted = $derived(
	shiki.codeToHtml(activeCode, {
		lang: activeLang === 'typescript' ? 'ts' : activeLang,
		theme: 'vitesse-dark',
	}),
);

function copyCode() {
	navigator.clipboard.writeText(activeCode);
	copied = true;
	setTimeout(() => { copied = false; }, 2000);
}
</script>

<div class="code-block">
	<div class="code-header">
		{#if isMultiLang && onLangChange}
			<div class="lang-tabs">
				{#each ['bash', 'python', 'typescript'] as l}
					<button
						class="lang-tab"
						class:lang-tab-active={activeLang === l}
						onclick={() => onLangChange?.(l as MultiLang)}
					>{l}</button>
				{/each}
			</div>
		{:else if label}
			<span>{label}</span>
		{:else}
			<span></span>
		{/if}
		<button class="btn-copy-sm" onclick={copyCode}>
			{#if copied}
				<Check class="w-3.5 h-3.5" />
			{:else}
				<Clipboard class="w-3.5 h-3.5" />
			{/if}
		</button>
	</div>
	<div class="code-body">
		{@html highlighted}
	</div>
</div>

<style>
	.code-block {
		margin-top: .75rem;
		border: 1px solid rgba(63,63,70,.3);
		border-radius: .6rem;
		overflow: hidden;
	}
	.code-header {
		display: flex; align-items: center; justify-content: space-between;
		padding: .45rem .85rem;
		background: rgba(63,63,70,.15);
		border-bottom: 1px solid rgba(63,63,70,.25);
		font-size: .6875rem; font-weight: 500; color: #71717a;
	}
	.code-body {
		overflow-x: auto;
	}
	.code-body :global(pre) {
		margin: 0;
		padding: .85rem 1rem;
		background: rgba(9,9,11,.4) !important;
	}
	.code-body :global(code) {
		font-size: .8rem;
		line-height: 1.5;
	}
	.btn-copy-sm {
		padding: .25rem;
		color: #52525b;
		cursor: pointer;
		background: none;
		border: none;
		border-radius: .25rem;
		transition: color .2s;
	}
	.btn-copy-sm:hover { color: #a1a1aa; }
	.lang-tabs {
		display: flex; gap: .125rem;
	}
	.lang-tab {
		padding: .15rem .5rem;
		border: none;
		border-radius: .25rem;
		font-size: .6875rem;
		font-weight: 600;
		color: #52525b;
		background: transparent;
		cursor: pointer;
		transition: all .15s;
		font-family: monospace;
	}
	.lang-tab:hover { color: #a1a1aa; }
	.lang-tab-active {
		background: rgba(251,191,36,.1);
		color: #fbbf24;
	}
</style>
