# Data Model: Public Landing Page

No persistent data.

- **LandingSettings** (server function result, not persisted): `enabled: boolean` (from `LANDING_PAGE_ENABLED`), `origin: string` (request origin, for canonical and `og:url`), `hasSessionCookie: boolean`.
- **Landing content** (constants): sections of `{ icon, title, description }` items; `landingLinks` `{ repository, docs, issues, companion }`.
