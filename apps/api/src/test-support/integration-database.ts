import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

// Import application modules only inside run: their database clients read the environment once.
export async function withIntegrationDatabase(
  run: () => Promise<void>,
  options: { migrationsFolder?: string; environment?: Record<string, string | undefined> } = {},
) {
  assert.notEqual(process.env.NODE_ENV, "production");
  const require = createRequire(new URL("../../../../packages/db/package.json", import.meta.url));
  require("dotenv").config({
    path: fileURLToPath(new URL("../../../../.env", import.meta.url)),
    quiet: true,
  });
  assert.notEqual(process.env.NODE_ENV, "production");
  const { Pool } = require("pg") as typeof import("pg");
  const { migrate } =
    require("drizzle-orm/node-postgres/migrator") as typeof import("drizzle-orm/node-postgres/migrator");
  const { resolveDatabaseUrl } = await import("../../../../packages/db/src/database-url");
  const connectionUrl = new URL(process.env.TEST_DATABASE_URL ?? resolveDatabaseUrl());
  const databaseName = `openmonetis_api_test_${randomUUID().replaceAll("-", "")}`;
  const admin = new Pool({ connectionString: connectionUrl.toString() });
  connectionUrl.pathname = `/${databaseName}`;
  const environment: Record<string, string | undefined> = {
    NODE_ENV: "test",
    DATABASE_URL: connectionUrl.toString(),
    EXTERNAL_DATABASE_URL: connectionUrl.toString(),
    BETTER_AUTH_URL: "http://localhost:7001",
    BETTER_AUTH_SECRET: "openmonetis-integration-secret-at-least-32-characters",
    WEB_URL: "http://localhost:7002",
    CORS_ORIGIN: "http://localhost:7002",
    DISABLE_SIGNUP: "false",
    GOOGLE_CLIENT_ID: undefined,
    GOOGLE_CLIENT_SECRET: undefined,
    S3_BUCKET: undefined,
    S3_ACCESS_KEY_ID: undefined,
    S3_SECRET_ACCESS_KEY: undefined,
    S3_ENDPOINT: undefined,
    LOGO_DEV_SECRET_KEY: undefined,
    LOGO_DEV_PUBLISHABLE_KEY: undefined,
    LOGO_DEV_TOKEN: undefined,
    ...options.environment,
  };
  const previous = new Map(Object.keys(environment).map((key) => [key, process.env[key]]));
  let applicationPool: { end(): Promise<void> } | undefined;
  let created = false;
  try {
    await admin.query(`CREATE DATABASE "${databaseName}"`);
    created = true;
    for (const [key, value] of Object.entries(environment)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    const { db, pool } = await import("@openmonetis/db");
    applicationPool = pool;
    await migrate(db, {
      migrationsFolder:
        options.migrationsFolder ??
        fileURLToPath(new URL("../../../../packages/db/drizzle", import.meta.url)),
    });
    await run();
  } finally {
    try {
      await applicationPool?.end();
    } finally {
      for (const [key, value] of previous) {
        if (value === undefined) delete process.env[key];
        else process.env[key] = value;
      }
      try {
        if (created) await admin.query(`DROP DATABASE "${databaseName}"`);
      } finally {
        await admin.end();
      }
    }
  }
}
