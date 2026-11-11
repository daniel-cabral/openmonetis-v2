# Feature Specification: AI API-Key Providers

**Feature Branch**: `013-ai-api-key-providers`

**Created**: 2026-11-11

**Status**: Draft

**Input**: User description: "Support V1-style API-key AI providers (Claude, OpenAI, Gemini, OpenRouter, MiniMax, Ollama) next to the V2 CLI subscription providers (Claude Code, Codex, Antigravity), for diagnoses and chat. Keys are secrets."

## User Scenarios & Testing *(mandatory)*

### User Story 1 - Connect a provider with my own API key (Priority: P1)

A person opens Settings > Integrations, chooses an API-key provider (Claude, OpenAI, Gemini, OpenRouter or MiniMax), pastes a key, and the system checks it works and lists the models available for it. From then on the provider appears next to the CLI subscriptions wherever the person picks an assistant (diagnosis and chat).

**Why this priority**: This is the V1 behavior (insights by API key) that V2 lost; without it, people with no Claude/ChatGPT/Google subscription have no AI at all.

**Independent Test**: With AI enabled on the installation, save a valid key, pick a model, generate a diagnosis and send a chat message; remove the key and confirm the provider disappears.

**Acceptance Scenarios**:

1. **Given** AI is enabled and no key is saved for OpenAI, **When** the person pastes a valid key and confirms the data-sharing consent, **Then** the provider shows as "connected", shows only the last 4 characters of the key, and lists selectable models.
2. **Given** an invalid or revoked key, **When** the person saves it, **Then** the key is not stored, the provider stays "disconnected" and a short PT-BR message says the key was refused (without echoing the key or the vendor's raw error).
3. **Given** a connected API-key provider, **When** the person generates a diagnosis with it, **Then** the result follows the same contract, limits, voices, data-sharing permissions and failure handling as CLI providers.
4. **Given** a connected API-key provider, **When** the person chats, **Then** answers stream the same way as with CLI providers and can be stopped.
5. **Given** a saved key, **When** the person reopens Integrations, **Then** the full key is never shown or returned by any endpoint; only "connected" and the last 4 characters.
6. **Given** a saved key, **When** the person replaces it, **Then** the new key is validated first and the old one is kept if validation fails.
7. **Given** the person removes the provider, **When** confirmed, **Then** the stored key is deleted and past diagnoses and chats made with it remain readable.
8. **Given** another person on the same installation, **When** they open Integrations, **Then** they see nothing of the first person's keys; each person's keys are separate and never used for someone else's requests.

---

### User Story 2 - Use Ollama or another local model server (Priority: P2)

A person with a local or self-hosted Ollama picks "Ollama", selects one of the models the server reports (or types a model name) and uses it for diagnosis and chat, with no external vendor involved.

**Why this priority**: Privacy-first self-hosters were V1 users of Ollama; it requires no key but needs the server address handled safely.

**Independent Test**: Point the installation at a reachable Ollama, list models, generate a diagnosis.

**Acceptance Scenarios**:

1. **Given** the administrator configured an Ollama address for the installation, **When** a person opens Integrations, **Then** Ollama is offered, with its model list fetched from that server; an optional key is accepted when the server requires one.
2. **Given** no Ollama address is configured, **When** a person opens Integrations, **Then** Ollama is not offered.
3. **Given** the Ollama server is unreachable, **When** the person generates a diagnosis, **Then** it fails with a clear "provider unavailable" PT-BR reason and counts as a failed run, not as a hang.
4. **Given** a person-supplied model name containing unsafe characters, **When** saved, **Then** it is rejected by the same model-id rules used for CLI models.

---

### User Story 3 - Pick the assistant and model (Priority: P2)

Wherever the diagnosis and chat screens ask for an assistant, CLI providers and API-key providers appear in one list, each marked by how it connects (subscription or API key), and the person can set a preferred model per provider.

**Why this priority**: Avoids two parallel UIs; follows from stories 1 and 2.

**Independent Test**: Connect one CLI and one API-key provider; both selectable; preferred model remembered per provider.

**Acceptance Scenarios**:

1. **Given** one CLI and one API-key provider connected, **When** the person opens the diagnosis screen, **Then** both appear and the last used one is preselected.
2. **Given** a provider is disconnected, **When** a past diagnosis made with it is opened, **Then** it still renders and is labeled with the provider name.
3. **Given** AI is disabled on the installation, **When** a person opens Integrations, **Then** neither kind of provider can be connected, matching today's behavior.

### Edge Cases

- Vendor rate limit or quota error during a run: the run fails with a distinct, retryable PT-BR reason; the key stays saved.
- Key rotated at the vendor after being saved: next run fails with "key refused"; the provider is marked as needing attention and offers replace/remove.
- The same key pasted for two providers: stored independently; no cross-use.
- Whitespace or newline around a pasted key: trimmed; empty key rejected.
- Account deletion and account reset: all stored keys are deleted.
- Keys never appear in logs, error messages, API responses, exports, diagnoses, chat events or crash output.
- The installation secret used to protect stored keys is rotated or missing: keys become unusable and the person is asked to re-enter them; the system never falls back to storing plaintext.
- Cancelling a run stops the outbound request to the vendor.
- A model returns text outside the diagnosis contract: handled exactly like a CLI provider (diagnosis marked failed).

## Requirements *(mandatory)*

### Functional Requirements

- **FR-001**: System MUST support, per person, the API-key providers Claude (Anthropic), OpenAI, Gemini (Google), OpenRouter and MiniMax, plus Ollama, alongside the existing CLI providers Claude Code, Codex and Antigravity.
- **FR-002**: System MUST validate a key with the vendor before storing it and MUST NOT store a key that fails validation.
- **FR-003**: Stored keys MUST be protected at rest with a secret that belongs to the installation, MUST be readable only server-side when making a vendor call, and MUST NEVER be returned by any API response, written to logs, or included in error messages (AGENTS.md section 7).
- **FR-004**: The UI MUST show only the connection status and the last 4 characters of a stored key; replacing or removing a key MUST be possible at any time.
- **FR-005**: Every endpoint touching keys MUST require an authenticated session, filter by the owning person, and be rate limited; a person MUST NOT be able to use or discover another person's key.
- **FR-006**: API-key providers MUST obey the same rules as CLI providers: AI enabled flag, explicit consent before first use, data-sharing permissions, one run at a time per person, daily limit, cancel, retention, closed-list voices and the same diagnosis/chat output validation.
- **FR-007**: The list of models per API-key provider MUST come from the vendor when available, with a built-in fallback list; the person MAY choose a preferred model per provider; free-text model names MUST follow the existing model-id safety rules.
- **FR-008**: OpenRouter MUST accept any model id in its `vendor/model` form in addition to a listed model.
- **FR-009**: Ollama MUST be offered only when the installation administrator configured its address; the address MUST NOT be editable by regular people (prevents server-side request forgery); an optional key is stored under the same rules as other keys.
- **FR-010**: The diagnosis and chat screens MUST list CLI and API-key providers together, indicating the connection kind, and past runs MUST keep the provider they were made with.
- **FR-011**: Failures MUST be classified (key refused, quota or rate limit, provider unavailable, invalid response) with PT-BR messages that never include vendor raw text or the key.
- **FR-012**: Data leaving the installation MUST be limited to what the person's data-sharing permissions allow, and the consent screen MUST state that, for API-key providers, the data goes to the chosen vendor under the person's own key.
- **FR-013**: Deleting the account or resetting account data MUST delete stored keys and connections.
- **FR-014**: The docs for the AI assistant MUST describe both connection kinds and the administrator settings (Ollama address, key-protection secret) without listing example key values.

### Key Entities *(include if feature involves data)*

- **AI provider connection**: per person and provider; connection kind (subscription or API key), consent timestamp, preferred model, status; extended from the existing connection record.
- **Provider credential**: the encrypted API key for a connection, with the last 4 characters kept for display and a rotation timestamp.
- **AI run record**: existing diagnosis and chat entries, which reference the provider used.

## Success Criteria *(mandatory)*

### Measurable Outcomes

- **SC-001**: A person with a valid vendor key can go from empty Integrations to a generated diagnosis in under 3 minutes.
- **SC-002**: A scan of every API response, log line and stored diagnosis/chat produced during the acceptance tests finds 0 occurrences of a full key.
- **SC-003**: 100% of invalid keys are refused at save time with no key stored.
- **SC-004**: For the same input data, diagnoses from API-key providers pass the same output-contract validation as CLI providers; contract violations are reported as failed runs in 100% of cases.
- **SC-005**: Existing CLI-provider flows pass their current tests unchanged.
- **SC-006**: Cancelling a run stops it within 5 seconds and does not consume further quota from the vendor.

## Assumptions

- Keys are per person (V2 principle: no shared installation account; V1 used installation-wide environment keys, which are dropped as the primary model). Installation-wide environment keys are not supported in this feature.
- The key-protection secret is a new installation secret documented next to the existing ones; production fails closed (AI keys disabled) if it is missing.
- Vendor SDK/HTTP choices, model catalogs and the exact fallback model list are plan decisions; V1's catalog (`AVAILABLE_MODELS`) is the starting reference and is refreshed at implementation time.
- The AI service keeps having no database access; credentials reach it only per request over the existing internal secret channel.
- Ollama needs only an address (and optional key); no model downloading or management is offered.
- UI follows existing Integrations patterns; `mockup-ui` is run before planning and the choice recorded here.
- The upstream overlap check (CHANGELOG, `docs/ai-diagnoses.md`) is recorded in the plan.

## Source

V1 evidence:

- `src/features/insights/constants.ts` (provider ids openai, anthropic, google, minimax, openrouter, ollama; `AVAILABLE_MODELS`).
- `src/features/insights/lib/model-provider.ts` (model resolution; OpenRouter `vendor/model` regex; Ollama base URL and optional key; keys read from environment).
- `src/features/insights/actions/generate.ts`, `actions/storage.ts`, `components/provider-selection-card.tsx`, `model-selector.tsx`.
- `.env.example` lines 66-72 (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_GENERATIVE_AI_API_KEY`, `MINIMAX_API_KEY`, `OPENROUTER_API_KEY`, `OLLAMA_BASE_URL`, `OLLAMA_API_KEY`).

V2 current state: `docs/ai-diagnoses.md`, `packages/domain/src/ai-providers.ts` (providers claude, codex, antigravity; model-id pattern), `ai_provider_connections` and `ai_data_sharing` in `packages/db/src/schema.ts`, `apps/api/src/services/ai-providers.service.ts`, `ai-diagnoses.service.ts`, `ai-chats.service.ts`, `apps/ai`, `docs/environment-variables.md` (AI section).

Inventory row covered (section 1.1, Decision = "adapt: add API-key providers (incl. Ollama) next to V2 CLIs"): AI insights.

Kept / changed / dropped vs V1: kept the six providers and OpenRouter free model ids; changed key storage from installation environment variables to per-person encrypted keys, and diagnosis contract/limits/consent to V2's; dropped V1 saved insights (regenerable, no 016 mapping).

## Dependencies

- Roadmap order: after 011 (lane B).
- Builds on the existing V2 AI assistant (providers, diagnoses, chats, data sharing); AI must remain optional and off by default.
- 016 does not migrate V1 insights or keys (V1 keys lived in the environment, not in the database).
