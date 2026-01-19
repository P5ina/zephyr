<script lang="ts">
import './layout.css';
import favicon from '$lib/assets/favicon.svg';
import { browser } from '$app/environment';
import { onNavigate } from '$app/navigation';

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

// Page transitions using View Transitions API
onNavigate((navigation) => {
	if (!document.startViewTransition) return;

	return new Promise((resolve) => {
		document.startViewTransition(async () => {
			resolve();
			await navigation.complete;
		});
	});
});
</script>

<svelte:head><link rel="icon" href={favicon} /></svelte:head>
{@render children()}
