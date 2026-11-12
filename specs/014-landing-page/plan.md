# Implementation Plan: Public Landing Page

**Branch**: `014-landing-page` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

## Summary

Opt-in public landing page at `/` (web-server env `LANDING_PAGE_ENABLED=true`), with the login
screen always available at `/login`. Disabled (default) keeps `/` as today's login. Web-only change:
no API, database or domain change. Content is static PT-BR copy from V1, adjusted to V2 (spec "UI
decisions").

## Technical Context

**Language/Version**: TypeScript, React 19, TanStack Start 1.169 / Router 1.170
**Primary Dependencies**: existing shadcn/ui components (`Button`, `Card`, `Sheet`, `Tabs`), `lucide-react`; no new dependency
**Storage**: none
**Testing**: `tsx --test` pure tests for `landing.presentation.ts`; existing `test:auth:integration` as the regression gate (SC-001); SSR checks with `curl` on the lane dev server (port 7102)
**Target Platform**: web server (Node) + browser
**Project Type**: monorepo web application (only `apps/web` touched, plus docs/compose)
**Performance Goals**: static SSR page, no client data fetch required to render content (SC-004)
**Constraints**: no third-party requests, no tracking (FR-007); tokens only (FR-009)
**Scale/Scope**: 1 route rewritten, 1 route added, ~4 components, 1 server function

## Constitution Check

| Principle | Status |
| --- | --- |
| I. AGENTS.md authority | PASS: feature shape `apps/web/src/features/landing/` (`landing.api.ts` server fn, `landing.presentation.ts`, `components/`); no financial logic; shadcn components; tokens only; no images. |
| II. Upstream-compatible | PASS: self-contained in web + docs; opt-in so default behavior is unchanged. Fork-only (overlap check below). |
| III. V1 is reference | PASS: kept/changed/dropped recorded in spec "UI decisions". |
| IV. Financial integrity | N/A: no financial data; landing content makes no session-dependent calls. |
| V. Behavior-verified | PASS: pure tests for env parsing, robots body and head metadata; auth integration suite unchanged; SSR checks in quickstart. |

Post-design re-check: PASS.

## Upstream overlap check (2026-11-12)

- `upstream/main` is 9 commits ahead of `main` (0.17.0, 0.17.1). No landing page in code or
  CHANGELOG (only a mock-data note string). Upstream touched `login-form.tsx` and `signup-form.tsx`
  (9 deleted lines); this feature edits one line in each (`/login` targets), so a trivial conflict
  is possible at the orchestrator merge.
- Verdict: fork-only feature; no upstream equivalent to reuse.

## Project Structure

### Documentation (this feature)

```text
specs/014-landing-page/
├── spec.md, plan.md, research.md, data-model.md, quickstart.md, tasks.md
└── contracts/routes.md
```

### Source Code

```text
apps/web/src/
├── routes/index.tsx                     # `/`: landing (enabled) or login (default)
├── routes/login.tsx                     # new: `/login`, always the login screen
├── routes/robots[.]txt.ts               # rules depend on the setting
├── components/auth/login-page.tsx       # extracted from routes/index.tsx (same markup)
├── components/auth/protected-route.tsx  # signed-out redirect -> /login
├── components/auth/login-form.tsx       # Google errorCallbackURL -> /login
├── components/auth/signup-form.tsx, routes/signup.tsx  # "Entrar" links -> /login
└── features/landing/
    ├── landing.api.ts                   # createServerFn: { enabled, origin, hasSessionCookie }
    ├── landing.presentation.ts          # env parsing, robots body, head meta, copy, links
    ├── landing.presentation.test.ts
    └── components/landing-page.tsx, landing-header.tsx, landing-quick-start.tsx
docs/environment-variables.md, compose.yml, .env.example, CHANGELOG.md
```

**Structure Decision**: one web feature folder `landing`; route files stay thin.

## Complexity Tracking

None.
