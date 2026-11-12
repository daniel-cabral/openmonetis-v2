# Feature Specification: Public Landing Page

**Feature Branch**: `014-landing-page`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Port the V1 public landing page to V2 without breaking the self-hosted login flow (V2 `/` is currently the login screen)."

## Clarifications

### Session 2026-11-12

Answered autonomously by the lane worker (roadmap per-feature workflow).

- Q: Which component owns the on/off switch and what is it called? → A: The web server reads `LANDING_PAGE_ENABLED` at request time; only the value `true` enables it; the API is not involved, so an unreachable API never hides the landing page.
- Q: What is the dedicated login address and where do auth return addresses point? → A: `/login` always serves the login screen; the signed-out redirect from private pages, the Google error return and the "Entrar" link on signup point to `/login`; the post-login return stays `/`, which already sends authenticated people to their start page in both modes.
- Q: How are canonical address and social preview built without a configured public URL in the web server? → A: Canonical and `og:url` use the request origin plus `/`; the social image is the existing `icon-512.png`; no new image asset.
- Q: What exact robots rules apply when the landing page is enabled? → A: `Allow: /$` then `Disallow: /` for every user agent; disabled keeps `Disallow: /`.
- Q: How are V1 scroll animations and setup tabs handled? → A: Scroll animations are dropped (static render, no layout shift); quick start uses the project Tabs component; mobile navigation uses the project Sheet component.

## User Scenarios & Testing *(mandatory)*

### User Story 1 - A visitor understands the product (Priority: P1)

An unauthenticated visitor lands on a public page that explains what OpenMonetis is (self-hosted, open source finance), its main features, the Android Companion, who it is for (and not for), how to get started, and where the code lives, with clear calls to sign in or create an account.

**Why this priority**: It is the only purpose of the feature and is what V1 offered on the public domain.

**Independent Test**: Open the landing address in a private window; every section renders, every call to action goes where it says.

**Acceptance Scenarios**:

1. **Given** the landing page is enabled, **When** an unauthenticated visitor opens `/`, **Then** they see the hero, main features, extra features, Companion explanation, "who it is for", quick-start and footer sections in PT-BR.
2. **Given** the landing page, **When** the visitor activates "Entrar", **Then** they reach the login screen; when they activate "Criar conta", they reach signup.
3. **Given** signup is disabled on the installation, **When** the landing page renders, **Then** it does not offer "Criar conta" and offers only sign in.
4. **Given** a phone-width viewport, **When** the page renders, **Then** there is no horizontal scrolling and navigation is available through a compact menu.
5. **Given** dark or light theme (system), **When** the page renders, **Then** it respects the theme with legible contrast.
6. **Given** external links (repository, docs, Companion), **When** activated, **Then** they open the project's pages in a new tab safely (no opener access).

---

### User Story 2 - Self-hosted login keeps working (Priority: P1)

An installation owner who does not want a marketing page changes nothing and keeps today's behavior: `/` is the login screen. Someone who wants the landing page turns it on explicitly.

**Why this priority**: A non-negotiable constraint: self-hosters and every existing bookmark, passkey flow and OAuth return address must keep working.

**Independent Test**: With the default configuration run the existing login, signup, Google and passkey flows; then enable the landing page and repeat them.

**Acceptance Scenarios**:

1. **Given** the default configuration (landing page disabled), **When** a visitor opens `/`, **Then** the login screen appears exactly as today and no landing content is loaded.
2. **Given** the landing page enabled, **When** a visitor opens `/login`, **Then** the login screen appears with the same form, signup link and error handling as today's `/`.
3. **Given** the landing page enabled, **When** an authenticated person opens `/`, **Then** they are redirected to their configured start page, as happens today.
4. **Given** the landing page enabled, **When** a login attempt fails or an OAuth/passkey flow returns to the app, **Then** the person lands on a working login or start page and never on a 404 or a redirect loop.
5. **Given** the installation owner toggles the setting, **When** the service restarts, **Then** `/` switches between login and landing with no data migration and no change for authenticated people.
6. **Given** the authentication configuration cannot be loaded, **When** the landing page renders, **Then** the page still renders and the sign-up call to action is hidden.

---

### User Story 3 - Search engines and sharing (Priority: P3)

When the landing page is enabled, it can be indexed and shared with a proper title, description and preview, while the private application remains non-indexable.

**Why this priority**: V1 shipped SEO metadata; useful only for the public official site.

**Independent Test**: Fetch `/` and `robots.txt` with the setting on and off.

**Acceptance Scenarios**:

1. **Given** the landing page enabled, **When** a crawler fetches `/`, **Then** the page carries a title, description, canonical address and social preview in PT-BR.
2. **Given** the landing page enabled, **When** a crawler fetches `robots.txt`, **Then** only the landing address is allowed and every application path remains disallowed.
3. **Given** the landing page disabled, **When** a crawler fetches `robots.txt`, **Then** everything stays disallowed as today.

### Edge Cases

- Visitor with an expired session opens `/`: sees the landing page (or login), never a flash of the dashboard.
- A deep link such as `/dashboard` while signed out keeps today's behavior.
- Landing content mentions stack, repository links or the Companion; these are static text and never read data from the installation.
- Very slow or offline authentication check: the page does not block rendering on it.
- No images are loaded from third-party hosts without fallback; alt text and dimensions are set for content images.
- Keyboard-only navigation reaches every link and the mobile menu; headings are in order.

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST provide a public landing page in PT-BR with the V1 sections: hero with call to action, main features, extra features, Companion and PWA highlights, "how it works" steps, stack/self-hosting summary, "who it is for / not for", quick-start and footer.
- **FR-002**: The landing page MUST be opt-in per installation and disabled by default; when disabled, `/` MUST remain the login screen exactly as today.
- **FR-003**: The login screen MUST always be reachable at `/login` regardless of the setting; signed-out access to private pages and the Google error return MUST lead to `/login`.
- **FR-004**: When enabled, `/` MUST show the landing page to unauthenticated visitors and MUST redirect authenticated people to their start page.
- **FR-005**: All authentication flows (email/password, Google, passkeys, signup, invitation acceptance) MUST work identically with the landing page enabled or disabled; return addresses used by those flows MUST NOT depend on the setting.
- **FR-006**: Calls to action MUST adapt to the installation: sign-up call hidden when signup is disabled.
- **FR-007**: The page MUST be static content with no personal data, no tracking scripts and no calls that require a session.
- **FR-008**: The page MUST be responsive (no horizontal scroll at phone width), accessible (landmarks, heading order, focus order, alt text, sufficient contrast) and theme-aware.
- **FR-009**: Visual styling MUST use the project design tokens and components (no arbitrary colors; fonts only from the project font file).
- **FR-010**: When enabled, the page MUST expose title, description, canonical address and social preview metadata, and `robots` rules MUST allow only the landing address.
- **FR-011**: External links MUST point to the project repository, docs and Companion, open in a new tab with safe link attributes, and be defined in one place so a fork can change them.
- **FR-012**: Landing copy MUST NOT claim features V2 lacks; items from V1 that do not exist in V2 at release time MUST be adjusted or dropped.

### Key Entities *(include if feature involves data)*

- **Landing setting**: an installation-level on/off switch (administrator configuration `LANDING_PAGE_ENABLED`, read by the web server; not user data).
- **Landing content**: static sections and links, not stored per user.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: With default configuration, 100% of existing login, signup, Google, passkey and invitation tests pass unchanged.
- **SC-002**: With the landing page enabled, a visitor reaches the login screen in at most 1 click from the landing page, and a signed-in person never sees the landing page.
- **SC-003**: The landing page scores at least 90 on accessibility and 90 on best practices in an automated audit on desktop and mobile.
- **SC-004**: The first contentful view of the landing page appears in under 2 seconds on a typical broadband connection to the installation.
- **SC-005**: No horizontal scroll and no overlapping content from 320 px to 1440 px width.

## Assumptions

- The setting is an administrator environment configuration documented with the others; changing it needs a restart, not a database change.
- The landing page is for the public project site and for owners who want a home page; it is not required for self-hosting, matching the inventory note ("likely irrelevant for self-hosted").
- V1 text and structure are the content reference, rewritten for V2's real feature set and stack (TanStack Start instead of Next.js).
- The login screen moving to its own address is a pure addition; existing `/` login behavior is the default.
- UI requires `mockup-ui` before planning; the worker picks the option closest to V1 within V2 patterns and records it here.
- Upstream overlap check is recorded in the plan; this feature is flagged fork-only if upstream shows no interest in a public landing page.

## Source

V1 evidence:

- `src/app/(landing-page)/page.tsx` (645 lines: hero, features, Companion, PWA, quick start, who it is for, footer) and `layout.tsx` (SEO metadata, open graph, canonical).
- `src/features/landing/constants.ts` (`mainFeatures`, `extraFeatures`, `companionBanks`, `pwaHighlights`, `companionSteps`, `stackItems`, `whoIsItForItems`), `components/landing-navbar.tsx`, `mobile-nav.tsx`, `setup-tabs.tsx`, `animate-on-scroll.tsx`.

V2 current state: `apps/web/src/routes/index.tsx` (`/` is the login screen wrapped in a public-only guard), `apps/web/src/routes/signup.tsx`, `apps/web/src/routes/robots[.]txt.ts` (disallows everything), `apps/web/src/features/auth-config`, `docs/environment-variables.md`.

Inventory row covered (section 1.1, Decision = port): Landing page.

Kept / changed / dropped vs V1: kept the sections and PT-BR copy intent; changed to opt-in with a dedicated login address (V1 had login elsewhere and the landing at `/`); dropped the Next.js-specific stack text and any claim not true of V2.

## Dependencies

- Roadmap order: after 012 (lane A); no functional dependency on other specs.
- Touches the public route tree and robots rules; no database change.
- 016 is unaffected.

## UI decisions

Preview: temporary route `apps/web/src/routes/preview-landing.tsx` (`?v=a|b|c`, real app CSS and components, verified rendering via SSR on the lane dev server; removed before commit). Chosen autonomously as closest to V1 within V2 patterns: **Option A**.

- Option A (chosen): sticky header with logo, anchor links and auth actions; centered hero over the existing `atmospheric-wash`, eyebrow + `font-heading` title + two CTAs; sections in V1 order as `project-container` blocks; feature items as the project `Card`; icons from `lucide-react` with `text-brand-strong`.
- Option B (discarded): split hero with a terminal card; departs from V1's centered hero and duplicates the quick-start section.
- Option C (discarded): single-column docs list; loses V1's card grid and section rhythm.
- Mobile navigation: project `Sheet` behind a menu button below `md`; quick start: project `Tabs` ("Instalador" / "Desenvolvimento").
- Header actions: "Entrar" (`/login`) and "Criar conta" (`/signup`, hidden when signup is disabled or the configuration fails); the theme follows the system and the existing theme toggle is reused.
- Brand icons: `lucide-react` no longer ships a GitHub icon; external links use a generic icon (no new icon dependency).

Content decisions (FR-012, from V1 copy checked against V2):

- Dropped: metrics bar (live GitHub stars/forks call is a third-party request, conflicts with FR-007), dashboard/phone screenshots (no V2 assets; no images loaded), "Performance otimizada" (unmeasurable claim), Next.js stack text.
- Adjusted: "Insights com IA" → optional assistant using the person's own provider; "Gestão colaborativa (admin/viewer)" → people, sharing and split of expenses; Companion → described as a separate Android project that sends bank notifications to the inbox; PWA → installable to the home screen (no offline claim, there is no service worker); "open source e gratuito" → public source code under the project license (Sustainable Use License, not OSI open source); quick start → V2 install scripts plus the development steps with `pnpm db:migrate`.
- Added: trips, reconciliation of bank statements, attachments (all exist in V2).
- External links (single constants file): repository `https://github.com/felipegcoutinho/openmonetis-v2`, docs `…#readme`, issues `…/issues`, Companion `https://github.com/felipegcoutinho/openmonetis-companion`.
