import assert from "node:assert/strict";
import test from "node:test";
import { createApiKeyAdapters } from "./api-key-adapters";
import type { FetchLike } from "./api-key-provider";
import { createOpenAiCompatibleAdapter } from "./openai-compatible";
import type { ChatEvent } from "./provider";

const base = "https://vendor.test/v1";
const fallbackModels = [{ id: "fallback-model", name: "Fallback", isDefault: true }];
const credential = { apiKey: "sk-test-1234" };

type Respond = (url: string, init: RequestInit) => Response | Promise<Response>;

function vendor(respond: Respond): FetchLike {
  return async (input, init) => respond(String(input), init ?? {});
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status });
}

function completion(content: string) {
  return json({ choices: [{ message: { content } }] });
}

function openAiAdapter(
  fetch: FetchLike,
  overrides: Partial<Parameters<typeof createOpenAiCompatibleAdapter>[0]> = {},
) {
  return createOpenAiCompatibleAdapter({
    provider: "openai",
    baseUrl: base,
    fallbackModels,
    jsonMode: true,
    validateWithChat: false,
    fetch,
    ...overrides,
  });
}

const runInput = {
  instructions: "Analise.",
  prompt: "Dados",
  schema: { type: "object" },
  model: null,
  signal: undefined,
};

test("vendor refusals and outages map to the failure codes the API shows", async () => {
  const cases = [
    [401, "providerDisconnected"],
    [403, "providerDisconnected"],
    [429, "providerLimitReached"],
    [500, "providerUnavailable"],
  ] as const;
  for (const [status, code] of cases) {
    const adapter = openAiAdapter(vendor(() => json({ error: "vendor body" }, status)));
    assert.deepEqual(await adapter.listModels(credential), { status: "failed", code });
    assert.deepEqual(await adapter.run(credential, runInput), { status: "failed", code });
  }
  const unreachable = openAiAdapter(vendor(() => Promise.reject(new TypeError("fetch failed"))));
  assert.deepEqual(await unreachable.run(credential, runInput), {
    status: "failed",
    code: "providerUnavailable",
  });
});

test("a streamed chat emits the deltas in order and completes with the joined text", async () => {
  const body = [
    'data: {"choices":[{"delta":{"content":"Olá"}}]}',
    "",
    'data: {"choices":[{"delta":{"content":" mundo"}}]}',
    "",
    "data: [DONE]",
    "",
    "",
  ].join("\n");
  const adapter = openAiAdapter(vendor(() => new Response(body, { status: 200 })));
  const events: ChatEvent[] = [];
  const result = await adapter.chat(
    credential,
    { instructions: "Oi", prompt: "Diga", model: "fallback-model" },
    (event) => events.push(event),
  );
  assert.deepEqual(events, [
    { type: "delta", text: "Olá" },
    { type: "delta", text: " mundo" },
  ]);
  assert.deepEqual(result, {
    status: "completed",
    text: "Olá mundo",
    model: { id: "fallback-model", name: "fallback-model" },
  });
});

test("a run reads fenced JSON and reports prose as invalid output", async () => {
  const fenced = openAiAdapter(vendor(() => completion('```json\n{"resumo":"ok"}\n```')));
  assert.deepEqual(await fenced.run(credential, runInput), {
    status: "completed",
    output: { resumo: "ok" },
    model: { id: "fallback-model", name: "fallback-model" },
  });
  const prose = openAiAdapter(vendor(() => completion("Aqui está a análise.")));
  assert.deepEqual(await prose.run(credential, runInput), {
    status: "failed",
    code: "invalidOutput",
  });
});

test("an aborted signal stops the call and reports canceled", async () => {
  const controller = new AbortController();
  controller.abort();
  const adapter = openAiAdapter(
    vendor((_url, init) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return completion("{}");
    }),
  );
  const result = await adapter.run(credential, { ...runInput, signal: controller.signal });
  assert.deepEqual(result, { status: "failed", code: "canceled" });
});

test("the catalog falls back on 404 and every call carries the bearer key", async () => {
  const seen: Record<string, string>[] = [];
  const adapter = openAiAdapter(
    vendor((_url, init) => {
      seen.push(init.headers as Record<string, string>);
      return new Response("missing", { status: 404 });
    }),
  );
  assert.deepEqual(await adapter.listModels(credential), { status: "ok", models: fallbackModels });
  assert.equal(seen[0]?.authorization, "Bearer sk-test-1234");
});

test("OpenAI catalog drops ids that cannot chat", async () => {
  const adapters = createApiKeyAdapters({
    fetch: vendor(() => json({ data: [{ id: "gpt-5.5" }, { id: "text-embedding-3-large" }] })),
  });
  assert.deepEqual(await adapters.openai.listModels(credential), {
    status: "ok",
    models: [{ id: "gpt-5.5", name: "gpt-5.5", isDefault: true }],
  });
});

test("MiniMax validates the key with a chat call before serving its catalog", async () => {
  const adapters = createApiKeyAdapters({
    fetch: vendor((url) =>
      url.endsWith("/chat/completions")
        ? json({ error: "bad key" }, 401)
        : new Response("", { status: 404 }),
    ),
  });
  assert.deepEqual(await adapters.minimax.listModels(credential), {
    status: "failed",
    code: "providerDisconnected",
  });
});

test("Ollama is unavailable while its address is not configured", () => {
  const adapter = openAiAdapter(
    vendor(() => json({})),
    {
      provider: "ollama",
      baseUrl: () => null,
    },
  );
  assert.equal(adapter.isAvailable(), false);
});
