# Research: Public Landing Page

## R1. Where the setting lives
- Decision: `LANDING_PAGE_ENABLED` read by the web server (`process.env`) in a `createServerFn` and in the `robots.txt` handler; `true` (trimmed, case-insensitive) enables.
- Rationale: an unreachable API must not hide the page (US2-6); no DB change (FR-002).
- Alternatives: API auth-config field (couples landing to API availability); `VITE_` var (needs rebuild, spec says restart).

## R2. Rendering `/` without blocking on the session
- Decision: the server function also returns `hasSessionCookie` (a cookie named `better-auth.session_token` or `__Secure-better-auth.session_token`). No cookie: landing renders on the server immediately (indexable, no flash). Cookie present: today's `PublicOnlyRoute` (loading, then start page, or landing if the session expired).
- Rationale: `PublicOnlyRoute` alone would SSR "Carregando..." for crawlers; rendering landing unconditionally would flash it for signed-in people (SC-002).
- Alternatives: client-only redirect after render (flash); server-side session validation through the API (blocking API call).

## R3. Head metadata and robots
- Decision: `/` head built from loader data; when enabled: title, description, canonical, `og:*`, `twitter:card`, and `robots: index, follow` overriding the root `noindex` (verified by SSR curl). `og:image` = `<origin>/icon-512.png`. `robots.txt` enabled: `Allow: /$` then `Disallow: /`.
- Rationale: FR-010 without new assets or a public-URL env var.

## R4. Login address and auth return addresses
- Decision: `/login` renders the extracted `LoginPage`; `ProtectedRoute` and the Google `errorCallbackURL` go to `/login`; post-login `callbackURL` stays `/` (authenticated `/` redirects to the start page in both modes). Signup "Entrar" links go to `/login`.
- Rationale: FR-003/FR-005; return addresses independent of the setting; no 404 or loop.

## R5. Content truthfulness
- Decision: spec "UI decisions / Content decisions"; copy constants in `landing.presentation.ts`, links in one `landingLinks` object (FR-011).

## R6. Icons
- Decision: `lucide-react` only; it has no GitHub brand icon, so generic icons are used.
