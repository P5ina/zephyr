<script lang="ts">
import { Github } from 'lucide-svelte';
import logo from '$lib/assets/favicon.png';

interface Props {
	variant?: 'full' | 'simple';
	maxWidth?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '4xl' | '6xl';
}

let { variant = 'full', maxWidth = '6xl' }: Props = $props();

const maxWidthClass = {
	sm: 'max-w-sm',
	md: 'max-w-md',
	lg: 'max-w-lg',
	xl: 'max-w-xl',
	'2xl': 'max-w-2xl',
	'4xl': 'max-w-4xl',
	'6xl': 'max-w-6xl',
};
</script>

<footer class="relative z-10 border-t border-zinc-800/50 {variant === 'simple' ? 'mt-12' : ''}">
	<div class="{maxWidthClass[maxWidth]} mx-auto px-4 {variant === 'full' ? 'py-12' : 'py-8'}">
		{#if variant === 'full'}
			<div class="flex flex-col md:flex-row items-center justify-between gap-6">
				<a href="/" class="flex items-center gap-2">
					<img src={logo} alt="GenSprite" class="w-6 h-6 rounded-md" />
					<span class="text-sm font-semibold text-white">GenSprite</span>
				</a>
				<div class="flex items-center gap-6 text-sm text-zinc-400">
					<a href="/terms" class="hover:text-white transition-colors">Terms</a>
					<a href="/privacy" class="hover:text-white transition-colors">Privacy</a>
					<a href="/refund" class="hover:text-white transition-colors">Refunds</a>
					<a href="https://github.com" target="_blank" rel="noopener" class="hover:text-white transition-colors">
						<Github class="w-5 h-5" />
					</a>
				</div>
				<p class="text-sm text-zinc-500">© 2025 GenSprite. All rights reserved.</p>
			</div>
		{:else}
			<div class="flex flex-wrap items-center justify-center gap-6 text-sm text-zinc-500">
				<a href="/terms" class="hover:text-white transition-colors">Terms of Service</a>
				<a href="/privacy" class="hover:text-white transition-colors">Privacy Policy</a>
				<a href="/refund" class="hover:text-white transition-colors">Refund Policy</a>
			</div>
		{/if}
	</div>
</footer>
