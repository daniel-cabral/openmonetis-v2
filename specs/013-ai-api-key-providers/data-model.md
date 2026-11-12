# Data Model: AI API-Key Providers

## Domain (`packages/domain/src/ai-providers.ts`)

- `aiProviders`: `claude`, `codex`, `antigravity`, `anthropic`, `openai`, `gemini`, `openrouter`,
  `minimax`, `ollama`.
- `aiSubscriptionProviders` (`claude`, `codex`, `antigravity`) and `aiApiKeyProviders` (the other
  six); `aiProviderKindOf(provider)` -> `"subscription" | "apiKey"`.
- `aiProviderLoginMethodByProvider` becomes `Record<AiSubscriptionProvider, ...>`.
- `aiProviderStatuses` gains `needsAttention`.
- `aiApiKeyModelIdPattern = /^[A-Za-z0-9](?!.*\.\.)[A-Za-z0-9._:\/-]{0,79}$/`;
  `aiProviderAcceptsCustomModel(provider)` true for `openrouter` (must contain one `/`) and `ollama`.
- `aiApiKeyMaximumLength = 512`; key is trimmed, non-empty, no whitespace inside.
- `aiApiKeyRequired(provider)` false only for `ollama`.

`aiDiagnosisFailureCodes` and `aiChatFailureCodes` gain `providerUnavailable`.

## Database (migration `0036_ai_api_key_providers`)

- `ALTER TYPE ai_provider ADD VALUE` x6; `ALTER TYPE ai_diagnosis_failure_code ADD VALUE
  'providerUnavailable'` (and the chat failure code enum if it is a pg enum).
- New table `ai_provider_credentials`:

| Column | Type | Notes |
|---|---|---|
| id | uuid pk | |
| user_id | text, FK user.id on delete cascade | |
| provider | ai_provider | API-key providers only (service-enforced) |
| ciphertext | text (base64) | AES-256-GCM |
| nonce | varchar(24) (base64 of 12 bytes) | |
| auth_tag | varchar(32) (base64 of 16 bytes) | |
| last4 | varchar(4) | display only |
| secret_fingerprint | varchar(16) | detects a rotated `AI_KEYS_SECRET` |
| rotated_at | timestamptz not null | set on each save |
| refused_at | timestamptz null | set when a run gets "key refused" |
| created_at / updated_at | timestamptz | |

Unique `(user_id, provider)`. Ollama without key stores no credential row: its connection is the
consent row in `ai_provider_connections`.

## State

```
disconnected --save valid key + consent--> connected
connected --run returns providerDisconnected--> needsAttention
connected|needsAttention --secret fingerprint mismatch / decrypt failure--> needsAttention
needsAttention --save valid key--> connected
any --remove (disconnect)--> disconnected (credential + connection rows deleted)
AI_KEYS_SECRET missing or AI disabled --> unavailable (API-key providers)
Ollama: OLLAMA_BASE_URL unset (AI service reports unavailable) --> unavailable, hidden in UI
```

Account deletion: FK cascade. Account data reset (`settings.repository.resetForUser`): deletes
`ai_provider_credentials` and `ai_provider_connections` of the user.

## API output (`AiProviderOutputSchema` additions)

- `kind`: `subscription | apiKey`
- `keyLast4`: `string | null` (never more)
- `acceptsCustomModel`: boolean
- `keyRequired`: boolean
