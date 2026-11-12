import assert from "node:assert/strict";
import test from "node:test";
import { createAiKeyCipher } from "./ai-key-cipher";

const secret = "test-ai-keys-secret-with-more-than-32-chars";
const apiKey = "sk-test-0123456789abcdef";

test("a sealed API key decrypts back and its ciphertext does not carry the key bytes", () => {
  const cipher = createAiKeyCipher(secret);
  const sealed = cipher.encrypt(apiKey, "userA:openai");

  assert.equal(cipher.decrypt(sealed, "userA:openai"), apiKey);
  assert.equal(Buffer.from(sealed.ciphertext, "base64").includes(Buffer.from(apiKey)), false);
});

test("decrypt returns null for another secret, another owner binding or a tampered tag", () => {
  const cipher = createAiKeyCipher(secret);
  const sealed = cipher.encrypt(apiKey, "userA:openai");

  assert.equal(createAiKeyCipher(`${secret}-rotated`).decrypt(sealed, "userA:openai"), null);
  assert.equal(cipher.decrypt(sealed, "userB:openai"), null);

  const tag = Buffer.from(sealed.authTag, "base64");
  tag[0] ^= 1;
  assert.equal(cipher.decrypt({ ...sealed, authTag: tag.toString("base64") }, "userA:openai"), null);
});
