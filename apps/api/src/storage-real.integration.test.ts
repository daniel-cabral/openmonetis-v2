import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";
import { fileURLToPath } from "node:url";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import dotenv from "dotenv";

test("configured real storage protects signed objects and enforces web CORS", {
  skip: process.env.REAL_STORAGE_INTEGRATION_TEST !== "1",
  timeout: 90_000,
}, async (t) => {
  dotenv.config({ path: fileURLToPath(new URL("../../../.env", import.meta.url)), quiet: true });
  for (const field of ["BUCKET", "ACCESS_KEY_ID", "SECRET_ACCESS_KEY", "ENDPOINT", "REGION"]) {
    if (process.env[`TEST_REAL_S3_${field}`])
      process.env[`S3_${field}`] = process.env[`TEST_REAL_S3_${field}`];
  }
  const bucket = process.env.S3_BUCKET;
  const accessKeyId = process.env.S3_ACCESS_KEY_ID;
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY;
  assert.ok(
    bucket && accessKeyId && secretAccessKey,
    "Configure S3 credentials or TEST_REAL_S3_* before running this live test",
  );
  const endpoint = process.env.S3_ENDPOINT || undefined;
  if (endpoint)
    assert.equal(
      new URL(endpoint).protocol,
      "https:",
      "Live tests require an HTTPS provider endpoint",
    );
  const origin = new URL(
    process.env.TEST_REAL_WEB_ORIGIN ?? process.env.WEB_URL ?? "http://localhost:7002",
  ).origin;
  const region = process.env.S3_REGION || "us-east-1";
  const client = new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: Boolean(endpoint),
    requestChecksumCalculation: "WHEN_REQUIRED",
    maxAttempts: 2,
  });
  const prefix = `openmonetis-infrastructure-tests/${randomUUID()}`;
  const keys = [`${prefix}/pending.pdf`, `${prefix}/committed.pdf`];
  const versions = new Map<string, string>();
  const bytes = new TextEncoder().encode(
    "%PDF-1.7\nOpenMonetis disposable infrastructure test\n%%EOF",
  );
  const { attachmentStorage: storage } = await import("./utils/storage");
  let downloadUrl: string | undefined;
  try {
    await t.test(
      "upload, inspect, conditional copy and signed download preserve exact bytes",
      async () => {
        const { uploadUrl } = await storage.prepareUpload(keys[0], "application/pdf", bytes.length);
        const uploaded = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "content-type": "application/pdf", origin },
          body: bytes,
          signal: AbortSignal.timeout(15_000),
        });
        assert.equal(uploaded.ok, true, `Upload returned HTTP ${uploaded.status}`);
        const source = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: keys[0] }));
        if (source.VersionId && source.VersionId !== "null")
          versions.set(keys[0], source.VersionId);
        const inspection = await storage.inspect(keys[0]);
        assert.equal(inspection.size, bytes.length);
        assert.equal(inspection.mimeType, "application/pdf");
        assert.deepEqual(inspection.bytes, bytes);
        assert.ok(inspection.etag);
        await storage.commit(keys[0], keys[1], inspection.etag);
        const target = await client.send(new HeadObjectCommand({ Bucket: bucket, Key: keys[1] }));
        if (target.VersionId && target.VersionId !== "null")
          versions.set(keys[1], target.VersionId);
        const signed = await storage.signDownload(keys[1], "comprovante.pdf", "attachment");
        downloadUrl = signed.url;
        const downloaded = await fetch(signed.url, { signal: AbortSignal.timeout(15_000) });
        assert.equal(downloaded.status, 200);
        assert.match(
          downloaded.headers.get("content-disposition") ?? "",
          /attachment;.*comprovante\.pdf/,
        );
        assert.match(downloaded.headers.get("cache-control") ?? "", /private.*no-store/);
        assert.deepEqual(new Uint8Array(await downloaded.arrayBuffer()), bytes);
      },
    );
    await t.test(
      "unsigned, altered and expired URLs cannot read an existing private object",
      async () => {
        assert.ok(downloadUrl, "Signed download setup did not succeed");
        const unsigned = new URL(downloadUrl);
        unsigned.search = "";
        const altered = new URL(downloadUrl);
        altered.searchParams.set("X-Amz-Signature", "0".repeat(64));
        const expired = await getSignedUrl(
          client,
          new GetObjectCommand({ Bucket: bucket, Key: keys[1] }),
          { expiresIn: 60, signingDate: new Date(Date.now() - 10 * 60_000) },
        );
        for (const [kind, url] of [
          ["unsigned", unsigned],
          ["altered", altered],
          ["expired", expired],
        ] as const) {
          const response = await fetch(url, { signal: AbortSignal.timeout(15_000) });
          const body = await response.text();
          assert.ok(
            [400, 401, 403].includes(response.status),
            `${kind} access returned HTTP ${response.status}`,
          );
          if (response.status === 400)
            assert.match(
              body,
              /<Code>(?:InvalidArgument|AuthorizationQueryParametersError|AccessDenied|InvalidRequest)<\/Code>/,
            );
          assert.notEqual(body, new TextDecoder().decode(bytes));
        }
      },
    );
    await t.test(
      "CORS allows the configured origin to upload and rejects an unrelated origin",
      async () => {
        const { uploadUrl } = await storage.prepareUpload(keys[0], "application/pdf", bytes.length);
        async function preflight(requestOrigin: string) {
          return fetch(uploadUrl, {
            method: "OPTIONS",
            headers: {
              origin: requestOrigin,
              "access-control-request-method": "PUT",
              "access-control-request-headers": "content-type",
            },
            signal: AbortSignal.timeout(15_000),
          });
        }
        const allowed = await preflight(origin);
        assert.equal(
          allowed.ok,
          true,
          `Configured-origin preflight returned HTTP ${allowed.status}`,
        );
        assert.equal(allowed.headers.get("access-control-allow-origin"), origin);
        assert.match(allowed.headers.get("access-control-allow-methods") ?? "", /PUT/);
        assert.match(
          allowed.headers.get("access-control-allow-headers")?.toLowerCase() ?? "",
          /content-type|\*/,
        );
        const unwantedOrigin = `https://${randomUUID()}.example.invalid`;
        const denied = await preflight(unwantedOrigin);
        assert.notEqual(denied.headers.get("access-control-allow-origin"), unwantedOrigin);
        assert.notEqual(denied.headers.get("access-control-allow-origin"), "*");
      },
    );
  } finally {
    // Never list or remove pre-existing objects, buckets or provider policies.
    const cleanup = await Promise.allSettled(
      keys.map(async (key) => {
        assert.ok(key.startsWith(`${prefix}/`));
        await client.send(
          new DeleteObjectCommand({
            Bucket: bucket,
            Key: key,
            ...(versions.has(key) ? { VersionId: versions.get(key) } : {}),
          }),
        );
      }),
    );
    client.destroy();
    const failed = cleanup.filter((result) => result.status === "rejected");
    for (const result of failed)
      if (result.status === "rejected") {
        t.diagnostic(
          `Cleanup error: ${result.reason?.name ?? "unknown"}, HTTP ${result.reason?.$metadata?.httpStatusCode ?? "unknown"}`,
        );
      }
    assert.equal(failed.length, 0, `Cleanup failed for ${failed.length} objects under ${prefix}`);
  }
});
