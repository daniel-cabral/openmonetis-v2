# Contract: AI API-Key Providers

## Public API (`apps/api`, session required, `Cache-Control: private, no-store`)

### `PUT /ai/providers/{provider}/key`

Only for API-key providers. Rate limited (10 per 15 min per user, on top of the mutation limit).

Request (`SaveAiProviderKeyInputSchema`):

```json
{ "apiKey": "<pasted key, trimmed; optional for ollama>", "consent": true }
```

Flow: require AI enabled and `AI_KEYS_SECRET` -> validate key with the vendor through the AI
service -> on success encrypt + upsert credential, save consent -> `200 { data: AiProviderOutput }`.
On failure nothing changes (old key kept).

Errors (`{ error: true, message, code }`, message generic English, UI maps code to PT-BR):

| HTTP | code | when |
|---|---|---|
| 400 | `validation_error` | empty key, consent false, subscription provider |
| 422 | `ai_provider_key_refused` | vendor 401/403 |
| 429 | `ai_provider_limit_reached` | vendor 402/429 |
| 503 | `ai_provider_unavailable` | vendor unreachable / 5xx / Ollama not configured |
| 503 | `ai_disabled`, `ai_keys_unavailable` | AI off or secret missing |

### Existing endpoints, changed behavior

- `GET /ai/providers`: items for all nine providers with `kind`, `keyLast4`, `acceptsCustomModel`,
  `keyRequired`; Ollama omitted when the AI service reports it unavailable.
- `PATCH /ai/providers/{provider}` (preferred model): API-key model ids follow
  `aiApiKeyModelIdPattern`; free text accepted for OpenRouter (`vendor/model`) and Ollama.
- `DELETE /ai/providers/{provider}`: for API-key providers deletes credential + connection; no
  AI-service logout call.
- `POST /ai/providers/{provider}/logins`: rejected (`400`) for API-key providers.
- Diagnoses and chats: unchanged contract; `provider` accepts the new ids; new failure code
  `providerUnavailable`.

## Internal API (`apps/ai`, `Authorization: Bearer AI_SERVICE_SECRET`)

Body schema `credential: { apiKey: string | null }` (max 512), never logged.

- `POST /providers/{provider}/models` body `{ credential }` -> `ok({ models: ProviderModel[] })` or
  `ok({ status: "failed", code })` with `providerDisconnected | providerLimitReached |
  providerUnavailable`.
- `GET /providers/ollama` -> `ok({ available: boolean })`.
- `POST /homes/{homeId}/providers/{provider}/runs` and `/chats`: same as today plus `credential`
  in the body for API-key providers (required, `400` when missing). Same busy, cancel
  (`DELETE /homes/{homeId}/providers/{provider}/runs/current`), timeout and NDJSON chat stream.
