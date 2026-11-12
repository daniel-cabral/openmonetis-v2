# Quickstart: validate the landing page

Prereq: lane env (`.env`, DB `openmonetis_lane_a`), web dev server on 7102.

1. Pure tests: `pnpm exec tsx --test apps/web/src/features/landing/landing.presentation.test.ts`.
2. Auth regression (SC-001): `pnpm test:auth:integration` (from bash) against the lane DB.
3. Setting off: `/` contains `Entrar` and no landing heading; `/robots.txt` is `Disallow: /`; `/login` contains `Entrar`.
4. Setting on (`LANDING_PAGE_ENABLED=true`, restart web): `/` contains the hero heading, `rel="canonical"`, `og:title`, `index, follow`; `/robots.txt` contains `Allow: /$`; with a `better-auth.session_token` cookie `/` renders the loading state, not the landing.
5. Gate: Biome on touched files, `pnpm --filter @openmonetis/web lint:ui`, `pnpm typecheck`.
