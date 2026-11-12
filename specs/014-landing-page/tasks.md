# Tasks: Public Landing Page

**Input**: `specs/014-landing-page/` (spec.md incl. "Clarifications" and "UI decisions", plan.md,
research.md, data-model.md, contracts/routes.md, quickstart.md, v1-content.md)

**Tests**: few, behavior-focused (test-slop-guard). Pure tests only for `landing.presentation.ts`
(env parsing, cookie detection, robots body, head metadata); the auth flows are guarded by the
existing `pnpm test:auth:integration` suite (SC-001), unchanged. Routing is verified by SSR `curl`
checks in T015. Never run the bare `pnpm test`.

**Commands**: worktree root, **bash**. Unit: `node --import tsx --test <file>`. Lane A ports only
(7101-7103); stop any server you start. No new dependency.

**Conventions**: AGENTS.md (feature shape `apps/web/src/features/landing/`, no barrels, PT-BR UI
copy, shadcn components from `@/components/ui`, `Button asChild` wrapping `Link`/`a`, tokens only,
no `<img>`, fonts only from `fonts.css`). `lucide-react` has no GitHub icon: use generic icons.
`apps/web/src/routeTree.gen.ts` changes legitimately for the new `/login` route (commit that diff;
regenerate with `pnpm --filter @openmonetis/web exec tsr generate` or by starting vite on 7102).

## Format: `[ID] [P?] [Story] Description`

## Phase 1: Setup

- [x] T001 Copy the V1 content research to `specs/014-landing-page/v1-content.md` (content reference for T004).

## Phase 2: Foundational (blocks every story)

- [x] T009 Move the login screen markup from `apps/web/src/routes/index.tsx` into `apps/web/src/components/auth/login-page.tsx` exporting `LoginPage` (same JSX, same `PublicOnlyRoute` wrapper, unchanged copy). Create `apps/web/src/routes/login.tsx`: `createFileRoute("/login")`, head title `"Entrar · OpenMonetis"`, component `LoginPage`. Verify: typecheck. (Moved to Phase 2 so `Link to="/login"` typechecks in T006/T008; done by the orchestrator with `routeTree.gen.ts` regenerated.)
- [x] T002 Create `apps/web/src/features/landing/landing.presentation.ts` exporting: `landingLinks = { repository: "https://github.com/felipegcoutinho/openmonetis-v2", docs: "https://github.com/felipegcoutinho/openmonetis-v2#readme", issues: "https://github.com/felipegcoutinho/openmonetis-v2/issues", companion: "https://github.com/felipegcoutinho/openmonetis-companion" } as const`; `isLandingPageEnabled(value: string | undefined): boolean` (true only when `value?.trim().toLowerCase() === "true"`); `hasSessionCookie(cookieHeader: string | null | undefined): boolean` (true when a cookie named exactly `better-auth.session_token` or `__Secure-better-auth.session_token` has a non-empty value); `buildRobotsTxt(landingEnabled: boolean): string` (off: `"User-agent: *\nDisallow: /\n"`; on: `"User-agent: *\nAllow: /$\nDisallow: /\n"`); `landingTitle = "OpenMonetis | Finanças pessoais self-hosted"`, `landingDescription` (PT-BR, from spec content decisions, no "open source e gratuito" claim); `buildLandingHead(origin: string): { meta: Array<{ title: string } | { name: string; content: string } | { property: string; content: string }>; links: Array<{ rel: string; href: string }> }` (TanStack `head` shape; tags per `contracts/routes.md`; includes the `{ title: landingTitle }` entry) (canonical `${origin}/`, `og:image` `${origin}/icon-512.png`, `robots` `index, follow`). Verify: `pnpm --filter @openmonetis/web typecheck`.
- [x] T003 [P] Create `apps/web/src/features/landing/landing.presentation.test.ts` (node:test + assert, style of `apps/web/src/lib/csv.test.ts`): one test per rule: `isLandingPageEnabled` accepts only `true` (case/space-insensitive; `undefined`, `"1"`, `"false"` are off); `hasSessionCookie` detects both cookie names among others and ignores empty values and look-alike names; `buildRobotsTxt` off/on bodies; `buildLandingHead("https://x.test")` has canonical `https://x.test/`, `og:url`, `og:image` and robots `index, follow`. Verify: `node --import tsx --test apps/web/src/features/landing/landing.presentation.test.ts`.
- [ ] T004 Create `apps/web/src/features/landing/landing.api.ts` with `getLandingSettings = createServerFn({ method: "GET" }).handler(...)` (from `@tanstack/react-start`; read request via `getRequest()` / `getRequestHeader` from `@tanstack/react-start/server`, check the installed API with the TanStack Intent skill `@tanstack/start-client-core#start-core/server-functions`) returning `{ enabled: isLandingPageEnabled(process.env.LANDING_PAGE_ENABLED), origin: new URL(request.url).origin, hasSessionCookie: hasSessionCookie(cookieHeader) }`. No other data. Verify: typecheck.

## Phase 3: User Story 1 - A visitor understands the product (P1)

Goal: landing content per spec FR-001/FR-006/FR-008/FR-009/FR-011/FR-012 and "UI decisions" option A (preview `specs/014-landing-page/previews/preview-landing.tsx.txt`).

- [ ] T005 [US1] Add the copy constants to `landing.presentation.ts` (sections in V1 order without the metrics bar: hero, features, mobile (PWA + Companion with 3 steps), stack, quick start, who it is for / not for, final CTA, footer). Take V1 PT-BR copy from `specs/014-landing-page/v1-content.md` and apply every adjustment in spec "Content decisions": drop "Performance otimizada"; AI = optional assistant with the person's own provider; sharing = people and expense splitting (no admin/viewer); add trips, statement reconciliation, attachments; PWA = installable, no offline claim; Companion = separate Android project; stack = TanStack Start, React, Tailwind CSS, shadcn/ui / Hono, Drizzle, PostgreSQL / Better Auth (e-mail, Google, passkeys) / Docker Compose; quick start tab "Instalador" = the two `install.sh` / `install.ps1` one-liners from v1-content 4c and "Abra http://localhost:7002 e crie sua conta.", tab "Desenvolvimento" = the 8 dev commands from 4c (with `pnpm db:migrate`); "not for" items keep V1 intent with neutral wording; footer license line "Código-fonte público sob a Sustainable Use License." Exact exports (T006-T008 consume these names and shapes; section headings, hero and CTA copy are written inline in the components):
  ```ts
  import type { LucideIcon } from "lucide-react";
  export type LandingItem = { icon: LucideIcon; title: string; description: string };
  export type LandingNavLink = { href: `#${string}`; label: string };
  export type LandingQuickStartStep = { title: string; commands: readonly string[]; note?: string };
  export type LandingQuickStartTab = { value: "installer" | "development"; label: string; steps: readonly LandingQuickStartStep[] };
  export const landingNavLinks: readonly LandingNavLink[];        // #recursos Recursos, #mobile Mobile, #stack Stack, #como-usar Como usar, #para-quem-e Para quem é
  export const landingFeatures: readonly LandingItem[];           // feature cards (V1 main + extra, adjusted)
  export const landingPwaHighlights: readonly LandingItem[];      // 3 items
  export const landingCompanionSteps: readonly LandingItem[];     // 3 ordered steps
  export const landingStack: readonly LandingItem[];              // title = layer, description = technologies
  export const landingAudienceFor: readonly LandingItem[];        // 3 items
  export const landingAudienceNotFor: readonly LandingItem[];     // 3 items
  export const landingQuickStartTabs: readonly LandingQuickStartTab[]; // "Instalador", "Desenvolvimento"
  export const landingLicenseNote: string;
  ```
  Verify: typecheck.
- [ ] T006 [US1] Create `apps/web/src/features/landing/components/landing-header.tsx`: sticky header (`border-b bg-background/85 backdrop-blur-md`, `project-container`), `OpenMonetisLogo` linking to `/`, anchor nav (`#recursos`, `#mobile`, `#stack`, `#como-usar`, `#para-quem-e`) visible from `md`, existing `ThemeToggle` (from `@/components`, check its file), "Entrar" (`Link to="/login"`) and "Criar conta" (`Link to="/signup"`) only when prop `signupEnabled` is true; below `md` a menu button (`aria-label="Abrir menu"`) opening the project `Sheet` with the same links and actions; sheet closes on link click. Verify: typecheck.
- [ ] T007 [P] [US1] Create `apps/web/src/features/landing/components/landing-quick-start.tsx` using the project `Tabs` with the two tabs from T005; commands in `<pre><code>` blocks (`font-mono`, `overflow-x-auto` so phone width never scrolls the page); docs link "Ver documentação completa" to `landingLinks.docs`. Verify: typecheck.
- [ ] T008 [US1] Create `apps/web/src/features/landing/components/landing-page.tsx` exporting `LandingPage` (no props): reads `useQuery(authConfigQueryOptions())`; `signupEnabled = configuration.data?.signupEnabled === true` (hidden while pending or on error, US2-6); renders `LandingHeader`, then `<main>` with sections in order, each `section` with `id`, one `h1` in hero and `h2` per section (`h3` for items), option A layout (hero centered over `atmospheric-wash`, `eyebrow`, `font-heading`; features as project `Card` grid `sm:grid-cols-2 lg:grid-cols-3`), hero CTAs "Criar conta" (if signup) / "Entrar" and "Ver no GitHub"; final CTA; `<footer>` with links. Every external link `target="_blank" rel="noopener noreferrer"` from `landingLinks`. No images, no fetches besides auth config. Verify: typecheck and `pnpm --filter @openmonetis/web lint:ui`.

## Phase 4: User Story 2 - Self-hosted login keeps working (P1)

- [ ] T010 [US2] Rewrite `apps/web/src/routes/index.tsx`: `loader: () => getLandingSettings()`; component: if `!enabled` render `LoginPage` (today's behavior, title "Entrar · OpenMonetis"); if enabled and `hasSessionCookie` render `<PublicOnlyRoute><LandingPage /></PublicOnlyRoute>`; if enabled without cookie render `LandingPage` directly (no session cookie means no session can exist, so no session check, no loading state, content is in the SSR HTML). Head from loader data (`buildLandingHead(origin)` + `landingTitle`/`landingDescription` when enabled). Verify: typecheck.
- [ ] T011 [P] [US2] Point signed-out and auth return addresses to `/login`: `apps/web/src/components/auth/protected-route.tsx` (`Navigate to="/login"`), `apps/web/src/components/auth/login-form.tsx` (Google `errorCallbackURL` `new URL("/login", origin)`; keep `callbackURL` `/`), `apps/web/src/routes/signup.tsx` and `apps/web/src/components/auth/signup-form.tsx` ("Entrar" links `to="/login"`). Keep the logo links to `/`. Verify: typecheck; `rg -n 'to="/"' apps/web/src/components/auth apps/web/src/routes/signup.tsx` lists only logo links.

## Phase 5: User Story 3 - Search engines and sharing (P3)

- [ ] T012 [US3] `apps/web/src/routes/robots[.]txt.ts`: body `buildRobotsTxt(isLandingPageEnabled(process.env.LANDING_PAGE_ENABLED))`, headers unchanged. Verify: typecheck.

## Phase 6: Polish

- [ ] T013 [P] Document `LANDING_PAGE_ENABLED` (Web, default `false`, only `true` enables, restart the web) in the "Configurações de execução" table of `docs/environment-variables.md` (also mention `/login`), add `LANDING_PAGE_ENABLED: ${LANDING_PAGE_ENABLED:-false}` to the `web` service `environment` in `compose.yml` and update the sentence listing what Compose forwards, and add a commented `# LANDING_PAGE_ENABLED=false` line to `.env.example` near the web settings.
- [ ] T014 [P] Add a PT-BR entry under `### Fork` at the end of `## [Unreleased]` in `CHANGELOG.md`: landing page pública opcional (`LANDING_PAGE_ENABLED`), login sempre em `/login`.
- [ ] T015 Confirm no `preview-landing` route remains (preview moved to `specs/014-landing-page/previews/`), then run the quickstart SSR checks on port 7102 (setting off, then on) and record the output; with the setting on, check SC-005 (no horizontal scroll at 320 px and 1440 px: `document.documentElement.scrollWidth <= innerWidth`) and, if the browser tool works, an automated accessibility/best-practices audit for SC-003/SC-004; if the browser is unavailable, record SC-003/SC-004 as manual follow-ups in the report. Stop the server.
- [ ] T016 Gate: `npx biome check <touched files>`, `pnpm --filter @openmonetis/web lint:ui`, `pnpm typecheck`, T003 tests, `pnpm test:auth:integration` (lane DB). Show output.
- [ ] T017 Commit on `014-landing-page` (PT-BR messages, explicit paths, `git status --short` first); include spec artifacts and `routeTree.gen.ts`.

## Dependencies

T009 → T002 → T003, T004 → T005 → T006/T007 → T008 → T010 → T011; T012 after T002; T013/T014 any time; T015 → T016 → T017.

## Implementation strategy

MVP = Phases 2-4 (landing + routing). US3 and polish are small and land in the same branch.
