import prettier from 'eslint-config-prettier';
import path from 'node:path';
import js from '@eslint/js';
import svelte from 'eslint-plugin-svelte';
import { defineConfig, includeIgnoreFile } from 'eslint/config';
import globals from 'globals';
import ts from 'typescript-eslint';
import svelteConfig from './svelte.config.js';

const gitignorePath = path.resolve(import.meta.dirname, '.gitignore');

export default defineConfig(
	includeIgnoreFile(gitignorePath),
	js.configs.recommended,
	ts.configs.recommended,
	svelte.configs.recommended,
	prettier,
	svelte.configs.prettier,
	{
		languageOptions: { globals: { ...globals.browser, ...globals.node } },
		rules: {
			// typescript-eslint strongly recommend that you do not use the no-undef lint rule on TypeScript projects.
			// see: https://typescript-eslint.io/troubleshooting/faqs/eslint/#i-get-errors-from-the-no-undef-rule-about-global-variables-not-being-defined-even-though-there-are-no-typescript-errors
			'no-undef': 'off',
		},
	},
	{
		files: ['**/*.svelte', '**/*.svelte.ts', '**/*.svelte.js'],
		languageOptions: {
			parserOptions: {
				projectService: true,
				extraFileExtensions: ['.svelte'],
				parser: ts.parser,
				svelteConfig,
			},
		},
	},
	{
		rules: {
			// resolve() is `base + path`, and kit.paths.base is unset in
			// svelte.config.js with router.type at its 'pathname' default — so
			// resolve() is the identity function at every call site here.
			// Re-enable if kit.paths.base is ever set (subpath deploy) or if
			// router.type becomes 'hash'. At that point also audit the 13
			// redirect(302, '/...') calls and the window.location.href in
			// login/+page.svelte, which this rule does not cover.
			'svelte/no-navigation-without-resolve': 'off',

			// Every Set flagged today is pollingSet — poll de-dup bookkeeping
			// that is never read in markup or a $derived, so it is correctly
			// non-reactive. Converting those to SvelteSet would make the mount
			// effects subscribe to the set and re-poll forever. Kept as a
			// warning so a genuinely reactive Set in new code still surfaces.
			'svelte/prefer-svelte-reactivity': 'warn',

			// `_` prefix is this repo's existing convention for a parameter kept
			// for signature parity with a dispatcher's call shape.
			'@typescript-eslint/no-unused-vars': [
				'error',
				{
					argsIgnorePattern: '^_',
					varsIgnorePattern: '^_',
					caughtErrorsIgnorePattern: '^_',
					destructuredArrayIgnorePattern: '^_',
				},
			],
		},
	},
);
