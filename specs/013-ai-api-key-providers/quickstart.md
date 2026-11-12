# Quickstart: AI API-Key Providers

Prerequisites: lane B database migrated (`pnpm db:migrate`), root `.env` with `AI_ENABLED=true`,
`AI_KEYS_SECRET=<32+ random chars>`; optional `OLLAMA_BASE_URL` in the AI service env.

Automated checks (no vendor calls):

```bash
pnpm exec tsx --test packages/domain/src/ai-providers.test.ts
pnpm exec tsx --test apps/api/src/utils/ai-key-cipher.test.ts apps/api/src/services/ai-providers.service.test.ts
pnpm exec tsx --test apps/ai/src/providers/openai-compatible.test.ts apps/ai/src/providers/anthropic.test.ts apps/ai/src/app.test.ts
pnpm test:ai-provider-credentials:integration   # from bash
```

Manual (with a real key, optional): Settings > Integrations > OpenAI > Conectar, paste the key,
accept consent: provider shows "Conectado" and `•••• last4`; Reports > Diagnóstico com IA lists
OpenAI under "Chaves de API"; generate a diagnosis and send a chat message; remove the key: the
provider returns to "Desconectado" and past diagnoses still render.
