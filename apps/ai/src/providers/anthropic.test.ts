import assert from "node:assert/strict";
import test from "node:test";
import { createAnthropicAdapter } from "./anthropic";
import type { FetchLike } from "./api-key-provider";
import type { ChatEvent } from "./provider";

const credential = { apiKey: "sk-ant-test-5678" };
const runInput = {
  instructions: "Analise.",
  prompt: "Dados",
  schema: { type: "object" },
  model: null,
};

function vendor(
  respond: (url: string, init: RequestInit) => Response | Promise<Response>,
): FetchLike {
  return async (input, init) => respond(String(input), init ?? {});
}

function message(text: string) {
  return new Response(JSON.stringify({ content: [{ type: "text", text }] }), { status: 200 });
}

test("Anthropic refusals and outages map to the failure codes the API shows", async () => {
  const cases = [
    [401, "providerDisconnected"],
    [429, "providerLimitReached"],
    [503, "providerUnavailable"],
  ] as const;
  for (const [status, code] of cases) {
    const adapter = createAnthropicAdapter({
      fetch: vendor(() => new Response("vendor body", { status })),
    });
    assert.deepEqual(await adapter.run(credential, runInput), { status: "failed", code });
  }
});

test("a streamed Anthropic chat emits text deltas and completes with the joined text", async () => {
  const body = [
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":"Olá"}}',
    'event: content_block_delta\ndata: {"type":"content_block_delta","delta":{"type":"text_delta","text":" mundo"}}',
    'event: message_stop\ndata: {"type":"message_stop"}',
    "",
  ].join("\n\n");
  const adapter = createAnthropicAdapter({
    fetch: vendor(() => new Response(body, { status: 200 })),
  });
  const events: ChatEvent[] = [];
  const result = await adapter.chat(
    credential,
    { instructions: "Oi", prompt: "Diga", model: "claude-sonnet-4-6" },
    (event) => events.push(event),
  );
  assert.deepEqual(events, [
    { type: "delta", text: "Olá" },
    { type: "delta", text: " mundo" },
  ]);
  assert.equal(result.status === "completed" && result.text, "Olá mundo");
});

test("an Anthropic run reads fenced JSON and reports prose as invalid output", async () => {
  const fenced = createAnthropicAdapter({
    fetch: vendor(() => message('```json\n{"resumo":"ok"}\n```')),
  });
  assert.deepEqual(await fenced.run(credential, runInput), {
    status: "completed",
    output: { resumo: "ok" },
    model: { id: "claude-opus-4-8", name: "claude-opus-4-8" },
  });
  const prose = createAnthropicAdapter({ fetch: vendor(() => message("Sem JSON aqui.")) });
  assert.deepEqual(await prose.run(credential, runInput), {
    status: "failed",
    code: "invalidOutput",
  });
});

test("an aborted Anthropic call reports canceled", async () => {
  const controller = new AbortController();
  controller.abort();
  const adapter = createAnthropicAdapter({
    fetch: vendor((_url, init) => {
      if (init.signal?.aborted) throw new DOMException("aborted", "AbortError");
      return message("{}");
    }),
  });
  const result = await adapter.run(credential, { ...runInput, signal: controller.signal });
  assert.deepEqual(result, { status: "failed", code: "canceled" });
});
