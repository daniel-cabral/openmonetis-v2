# Implementation Plan: AI API-Key Providers

**Branch**: `013-ai-api-key-providers` | **Date**: 2026-11-12 | **Spec**: [spec.md](spec.md)

**Input**: Feature specification from `specs/013-ai-api-key-providers/spec.md` (clarified; UI option recorded in spec)

## Summary

Six API-key providers (`anthropic`, `openai`, `gemini`, `openrouter`, `minimax`, `ollama`) join the
three CLI providers in the same `ai_provider` enum and the same diagnosis/chat pipeline. The API
stores each person's key encrypted (AES-256-GCM, installation secret `AI_KEYS_SECRET`) in a new
`ai_provider_credentials` table, validates it with the vendor before saving, and sends it per
request to the AI service, which gains two `fetch`-based adapters (OpenAI-compatible and Anthropic)
for model listing, runs and streamed chats. Failures are classified (key refused, limit,
unavailable, invalid output); a refused key flags the provider as needing attention. The web shows
both kinds in one list and one grouped selector. Details: [research.md](research.md),
[data-model.md](data-model.md), [contracts/ai-provider-keys-api.md](contracts/ai-provider-keys-api.md).

## Technical Context

**Language/Version**: TypeScript (Node 22+), React 19

**Primary Dependencies**: Hono + `@hono/zod-openapi`, Drizzle, Zod, TanStack Start/Query/Form,
shadcn/ui, `node:crypto`, global `fetch`. No new dependency.

**Storage**: PostgreSQL (1 new table, 3 enum extensions, migration `0036`)

**Testing**: `node:test` + `tsx`. Unit: `packages/domain/src/ai-providers.test.ts`,
`apps/api/src/utils/ai-key-cipher.test.ts`, `apps/api/src/services/ai-providers.service.test.ts`
(extended), `apps/ai/src/providers/openai-compatible.test.ts`, `apps/ai/src/providers/anthropic.test.ts`,
`apps/ai/src/app.test.ts` (extended). Integration: `test:ai-provider-credentials:integration`
(`apps/api/src/repositories/ai-provider-credentials.repository.integration.test.ts`) against the
lane database. Vendors are never called in tests (injected `fetch`).

**Target Platform**: self-hosted web app (Docker), AI optional and off by default

**Project Type**: web application (pnpm monorepo)

**Performance Goals**: cancel stops the vendor request within 5 s (abort signal on `fetch`)

**Constraints**: keys never in responses, logs, errors, diagnoses or chats; AI service stays
database-free; lane B ports 7201-7203 only

**Scale/Scope**: 6 providers, 1 table, 1 new public endpoint, 2 internal endpoints, 2 adapters,
3 web touch points (Integrations list, connect dialog, provider select)

## Constitution Check

| Principle | Status | Notes |
|---|---|---|
| I. AGENTS.md authority | PASS | Extends feature `ai-providers` in every layer (domain, validators, route, service, repository, web); new repository `ai-provider-credentials.repository.ts` filters `userId`; cipher is a util injected into the service (DIP); no barrels |
| II. Upstream-compatible | PASS | Additive enum values/table/endpoint; docs `docs/ai-diagnoses.md`, `docs/environment-variables.md`, `.env.example`; CHANGELOG `Unreleased` `### Fork`. Not fork-only (useful upstream) |
| III. V1 is reference | PASS | Kept: six providers, OpenRouter free ids, Ollama address + optional key, V1 catalog as fallback. Changed: per-person encrypted keys instead of env keys, V2 contract/limits/consent. Dropped: installation-wide env keys, saved insights |
| IV. Financial integrity | PASS | No money logic; isolation by `userId`, AAD binds ciphertext to `userId:provider`; versioned migration |
| V. Behavior-verified | PASS | Integration test for storage/isolation/reset/no plaintext; unit tests for cipher, adapters (classification, stream, abort), service (validate-before-store, keep old key) |

Post-design re-check: PASS (Complexity Tracking empty).

## Upstream overlap check

`upstream/main` is at 0.17.1 (`4b00b83`), 9 commits ahead of fork `main`. CHANGELOG has no API-key
provider entry (line 395 states the CLI providers need no API key). `0c942cd perf(ai)` touches
`apps/ai/src/app.ts`, `ai-providers.queries.ts` and `ai-diagnoses-page.tsx` (diagnosis opens
without waiting for the connection check): textual merge risk in those files when the fork merges
0.17.x; no functional overlap.

## Project Structure

### Documentation (this feature)

```text
specs/013-ai-api-key-providers/
├── plan.md, research.md, data-model.md, quickstart.md
├── contracts/ai-provider-keys-api.md
└── previews/ (UI options, app.css ignored)
```

### Source Code (touched)

```text
packages/domain/src/ai-providers.ts, ai-diagnoses.ts, ai-chats.ts (+ ai-providers.test.ts)
packages/validators/src/ai-providers.ts
packages/db/src/schema.ts, packages/db/drizzle/0036_*.sql (+ meta)
apps/api/src/utils/ai-key-cipher.ts (+ test), utils/ai-service.ts (AI_KEYS_SECRET), app.ts
apps/api/src/repositories/ai-provider-credentials.repository.ts (+ integration test), settings.repository.ts
apps/api/src/services/ai-providers.service.ts (+ test), ai-diagnoses.service.ts, ai-chats.service.ts
apps/api/src/routes/ai-providers.ts
apps/ai/src/providers/api-key-provider.ts, openai-compatible.ts, anthropic.ts (+ tests), app.ts, index.ts, tools/manager.ts, utils/env
packages/validators/src/ai-tools.ts
apps/web/src/features/ai-providers/** (api, mutations, presentation, settings list, key dialog, select)
apps/web/src/features/ai-diagnoses|ai-chats presentation (failure message providerUnavailable)
docs/ai-diagnoses.md, docs/environment-variables.md, .env.example, CHANGELOG.md, package.json (script)
```

## Implementation phases

1. Domain + validators + schema/migration (foundation).
2. Cipher util + credentials repository + integration test.
3. AI service adapters + internal endpoints + tests.
4. API gateway/service/route wiring (save key, list, prepareRun with credential, refused flag,
   reset) + service tests.
5. Web (list, key dialog, grouped select, failure messages) per UI decision.
6. Docs, env example, CHANGELOG, gate.

## Complexity Tracking

None.
