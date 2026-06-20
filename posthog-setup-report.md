# PostHog post-wizard report

The wizard has completed a deep integration of PostHog analytics into GenSprite. The integration adds client-side initialization with session replay, a server-side reverse proxy to avoid ad blockers, server-side event tracking for all key business actions, and user identification so server-side and client-side events are correlated under the same distinct ID.

## Files created or modified

| File | Change |
|------|--------|
| `src/hooks.client.ts` | **Created** — PostHog client init (`/ingest` proxy, `capture_exceptions: true`) + `handleError` for automatic client-side error capture |
| `src/hooks.server.ts` | **Modified** — Added `/ingest` reverse proxy handle and `handleError` for server-side error capture via `posthog-node` |
| `src/lib/server/posthog.ts` | **Created** — Singleton `getPostHogClient()` for server-side PostHog usage |
| `svelte.config.js` | **Modified** — Added `paths.relative: false` (required for session replay with SSR) |
| `src/routes/app/+layout.svelte` | **Modified** — Calls `posthog.identify()` with user ID, email, and username when a logged-in user is present |

## Events added

| Event | Description | File |
|-------|-------------|------|
| `user_signed_up` | New user account created | `src/routes/login/github/callback/+server.ts` |
| `user_signed_up` | New user account created | `src/routes/login/google/callback/+server.ts` |
| `user_signed_up` | New user account created | `src/routes/login/magic/verify/+server.ts` |
| `promo_code_applied` | Promo code bonus granted on signup | `src/routes/login/github/callback/+server.ts` |
| `promo_code_applied` | Promo code bonus granted on signup | `src/routes/login/google/callback/+server.ts` |
| `promo_code_applied` | Promo code bonus granted on signup | `src/routes/login/magic/verify/+server.ts` |
| `rotation_started` | 8-direction sprite rotation job submitted (guest + auth) | `src/routes/api/rotate/generate/+server.ts` |
| `sprite_generation_started` | Sprite/texture asset generation job submitted (guest + auth) | `src/routes/api/assets/generate/+server.ts` |
| `concept_art_generation_started` | Concept art generation job submitted | `src/routes/api/concept-art/generate/+server.ts` |
| `animation_started` | Sprite animation job submitted | `src/routes/api/animate/generate/+server.ts` |
| `checkout_started` | User initiated Stripe checkout for a token pack | `src/routes/app/billing/+page.svelte` |
| `tokens_purchased` | Stripe webhook confirmed a completed token purchase | `src/routes/api/billing/webhook/+server.ts` |

## Next steps

We've built some insights and a dashboard for you to keep an eye on user behavior, based on the events we just instrumented:

- [Analytics basics (wizard) dashboard](https://us.posthog.com/project/472113/dashboard/1717148)
- [New signups over time](https://us.posthog.com/project/472113/insights/AqVbWZJn)
- [Generation activity by type](https://us.posthog.com/project/472113/insights/tHPDhvED)
- [Token purchases over time](https://us.posthog.com/project/472113/insights/UDs9VLp8)
- [Checkout-to-purchase funnel](https://us.posthog.com/project/472113/insights/kjRDjZ71)
- [Signup-to-generation funnel](https://us.posthog.com/project/472113/insights/3rkZY7iQ)

## Verify before merging

- [ ] Run a full production build (the wizard only verified the files it touched) and fix any lint or type errors introduced by the generated code.
- [ ] Run the test suite — call sites that were rewritten or instrumented may need updated mocks or fixtures.
- [ ] Add `PUBLIC_POSTHOG_PROJECT_TOKEN` and `PUBLIC_POSTHOG_HOST` to `.env.example` and any onboarding/bootstrap scripts so collaborators know what to set.
- [ ] Wire source-map upload (`posthog-cli sourcemap` or your bundler's upload step) into CI so production stack traces de-minify.
- [ ] Confirm the returning-visitor path also calls `identify` — the current implementation identifies in the app layout on mount, which covers returning sessions, but verify it fires correctly after a page refresh when a cookie-authenticated user is already logged in.

### Agent skill

We've left an agent skill folder in your project. You can use this context for further agent development when using Claude Code. This will help ensure the model provides the most up-to-date approaches for integrating PostHog.
