<script lang="ts">
import './layout.css';
import { fade } from 'svelte/transition';
import { browser } from '$app/environment';
import { page } from '$app/state';
import favicon from '$lib/assets/favicon.png';

let { children } = $props();

// Initialize Crisp chat
if (browser) {
	window.$crisp = [];
	window.CRISP_WEBSITE_ID = 'abe1cb7e-a741-42e1-bbc8-bd806fcffe56';
	const d = document;
	const s = d.createElement('script');
	s.src = 'https://client.crisp.chat/l.js';
	s.async = true;
	d.getElementsByTagName('head')[0].appendChild(s);
}
</script>

<svelte:head>
	<link rel="icon" type="image/png" sizes="32x32" href="/favicon-32x32.png" />
	<link rel="icon" type="image/png" sizes="16x16" href="/favicon-16x16.png" />
	<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png" />
	<link rel="icon" href={favicon} />
	<meta name="theme-color" content="#eab308" />
	<link rel="canonical" href="https://gensprite.p5ina.dev{page.url.pathname}" />
</svelte:head>
{#key page.url.pathname}
	<div in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
		{@render children()}
	</div>
{/key}
