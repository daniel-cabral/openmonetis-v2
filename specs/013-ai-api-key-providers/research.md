# Research: AI API-Key Providers

## R1. Vendor calls: HTTP adapters in `apps/ai`, no SDK

- Decision: two `fetch`-based adapters in `apps/ai/src/providers/`: `openai-compatible.ts` (OpenAI,
  Gemini, OpenRouter, MiniMax, Ollama) and `anthropic.ts` (Anthropic Messages API). Base URLs are
  constants per provider; Ollama's comes from `OLLAMA_BASE_URL` (admin env of the AI service, `/v1`
  appended when missing).
  - OpenAI `https://api.openai.com/v1`, Gemini `https://generativelanguage.googleapis.com/v1beta/openai`,
    OpenRouter `https://openrouter.ai/api/v1`, MiniMax `https://api.minimax.io/v1`,
    Anthropic `https://api.anthropic.com/v1` (`x-api-key`, `anthropic-version: 2023-06-01`).
- Rationale: all six expose either the OpenAI chat-completions shape or the Anthropic Messages
  shape; `fetch` + SSE parsing covers run, chat streaming and model listing with zero new
  dependencies (AGENTS.md section 7 asks to avoid them). `AbortSignal` cancels the HTTP request
  (SC-006).
- Alternatives: Vercel AI SDK + 6 provider packages (V1 choice): rejected, 7 dependencies for two
  wire formats; calling vendors from `apps/api`: rejected, `apps/ai` is the single place that talks
  to vendors and already owns run concurrency, cancel and output parsing.

## R2. Structured diagnosis output

- Decision: the run sends the existing instructions + prompt, plus the JSON schema in the system
  text, asks for JSON only (`response_format: {type: "json_object"}` for OpenAI, Gemini,
  OpenRouter; plain instruction for MiniMax, Ollama and Anthropic), then extracts the first JSON
  object from the text. Anything unparsable returns `invalidOutput`; contract validation stays in
  the API exactly as for CLI providers (SC-004).
- Alternatives: strict `json_schema` mode: rejected, not supported uniformly (Ollama, MiniMax).

## R3. Model catalog

- Decision: `listModels(credential)` calls `GET /models` (Anthropic `GET /v1/models`) and keeps
  chat-capable ids that match the API-key model-id pattern; on any non-auth failure it returns a
  built-in fallback list per provider (V1 `AVAILABLE_MODELS`, refreshed): OpenAI `gpt-5.5`,
  `gpt-5.4`, `gpt-5.4-mini`; Anthropic `claude-opus-4-8`, `claude-sonnet-4-6`,
  `claude-haiku-4-5-20251001`; Gemini `gemini-3.1-pro-preview`, `gemini-3-flash-preview`;
  MiniMax `MiniMax-M2.7`, `MiniMax-M2.5`; OpenRouter none (free text); Ollama none (server list).
  The first item is the default.
- Key validation = the same listing call: 401/403 means refused; for MiniMax (no reliable
  `/models`) validation is a 1-token chat completion against the default model.

## R4. Key protection

- Decision: AES-256-GCM, 12-byte random nonce, key = HKDF-SHA256(`AI_KEYS_SECRET`, info
  `openmonetis-ai-keys-v1`). Fingerprint of the secret = first 16 hex of HMAC-SHA256(secret,
  `fingerprint`), stored per credential. Additional authenticated data = `userId:provider` so a
  ciphertext copied to another row does not decrypt. Implemented with `node:crypto` in
  `apps/api/src/utils/ai-key-cipher.ts`.
- Missing secret: API-key providers report `unavailable` and cannot be saved (fail closed). In
  production a placeholder value is rejected at boot via `assertProductionSecret`.
- Alternatives: pgcrypto (key would travel in SQL), reusing `BETTER_AUTH_SECRET` (couples
  rotation of sessions and keys): rejected.

## R5. Failure classification

- Decision: HTTP 401/403 -> `providerDisconnected` ("key refused"), 402/429 ->
  `providerLimitReached`, network error, timeout to connect or 5xx -> new code
  `providerUnavailable`, unparsable output -> `invalidOutput`, abort -> `canceled`. Vendor body
  text is never forwarded. `providerUnavailable` is added to the diagnosis and chat failure code
  lists (pg enum value added in the migration) with a PT-BR message.
- On `providerDisconnected` from an API-key provider the API sets `refused_at` on the credential;
  the provider then reports `needsAttention` until a new key is validated (FR-015).

## R6. Key transport to `apps/ai`

- Decision: the API decrypts per request and sends `credential: { apiKey }` in the JSON body of
  the existing secret-authenticated calls (`runs`, `chats`) and of a new
  `POST /providers/:provider/models` (no home needed). The AI service validates the body with Zod,
  never logs bodies and never writes the key to disk or to the home directory.

## R7. Logging and leak scan

- `apps/ai` and `apps/api` request loggers log method/path/status only (checked in tasks).
  The no-leak scan (SC-002) is the set of assertions in T005 (ciphertext), T006 (raw DB row),
  T010 (service outputs) and T012 (persisted diagnosis and chat rows).
