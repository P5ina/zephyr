<script lang="ts">
import './layout.css';
import { fade } from 'svelte/transition';
import { browser } from '$app/environment';
import { page } from '$app/state';
import favicon from '$lib/assets/favicon.png';
import { injectAnalytics } from '@vercel/analytics/sveltekit';

let { children } = $props();

// Initialize Vercel Analytics
injectAnalytics();

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
	<link rel="canonical" href="https://gensprite.ai{page.url.pathname}" />
	<link rel="preconnect" href="https://fonts.googleapis.com" />
	<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="anonymous" />
	<link href="https://fonts.googleapis.com/css2?family=Syne:wght@700;800&family=DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600&display=swap" rel="stylesheet" />
</svelte:head>
{#key page.url.pathname}
	<div in:fade={{ duration: 150, delay: 150 }} out:fade={{ duration: 150 }}>
		{@render children()}
	</div>
{/key}
