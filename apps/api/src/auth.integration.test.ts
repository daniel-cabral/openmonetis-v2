import assert from "node:assert/strict";
import { createRequire } from "node:module";
import test from "node:test";
import { fileURLToPath } from "node:url";

test("closed registration blocks password and Google provisioning while existing logins work", {
  skip: process.env.AUTH_INTEGRATION_TEST !== "1",
}, async () => {
  const require = createRequire(new URL("../../../packages/db/package.json", import.meta.url));
  require("dotenv").config({
    path: fileURLToPath(new URL("../../../.env", import.meta.url)),
    quiet: true,
  });
  const { Pool } = require("pg");
  const { migrate } = require("drizzle-orm/node-postgres/migrator");
  const { resolveDatabaseUrl } = await import("../../../packages/db/src/database-url");
  assert.notEqual(process.env.NODE_ENV, "production");
  const databaseUrl = new URL(process.env.TEST_DATABASE_URL ?? resolveDatabaseUrl());
  const admin = new Pool({ connectionString: databaseUrl.toString() });
  const databaseName = `openmonetis_auth_test_${Date.now()}`;
  const changedEnvironment = [
    "NODE_ENV",
    "DATABASE_URL",
    "EXTERNAL_DATABASE_URL",
    "BETTER_AUTH_URL",
    "WEB_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "DISABLE_SIGNUP",
  ];
  const previous = new Map(changedEnvironment.map((key) => [key, process.env[key]]));
  let applicationPool: { end(): Promise<void> } | undefined;
  await admin.query(`CREATE DATABASE "${databaseName}"`);
  try {
    databaseUrl.pathname = `/${databaseName}`;
    process.env.NODE_ENV = "test";
    process.env.DATABASE_URL = databaseUrl.toString();
    process.env.EXTERNAL_DATABASE_URL = databaseUrl.toString();
    process.env.BETTER_AUTH_URL = "http://localhost:7002";
    process.env.WEB_URL = "http://localhost:7002";
    process.env.GOOGLE_CLIENT_ID = "test-google-client";
    process.env.GOOGLE_CLIENT_SECRET = "test-google-secret";
    process.env.DISABLE_SIGNUP = "true";
    const { db, pool, user, people, categories } = await import("@openmonetis/db");
    applicationPool = pool;
    await migrate(db, {
      migrationsFolder: fileURLToPath(new URL("../../../packages/db/drizzle", import.meta.url)),
    });
    const { createAuth, authConfiguration } = await import("./auth");
    assert.deepEqual(authConfiguration, { signupEnabled: false, googleEnabled: true });
    const closed = createAuth();
    const open = createAuth({ disableSignup: false });
    // Better Auth disables origin/CSRF checks by default in NODE_ENV=test.
    // Exercise the same checks that protect production requests.
    for (const instance of [closed, open]) {
      const context = await instance.$context;
      context.skipOriginCheck = false;
      context.skipCSRFCheck = false;
    }
    const request = (instance: typeof closed, path: string, body: unknown) =>
      instance.handler(
        new Request(`http://localhost:7002/api/auth${path}`, {
          method: "POST",
          headers: { "content-type": "application/json", origin: "http://localhost:7002" },
          body: JSON.stringify(body),
        }),
      );
    const credentials = {
      name: "Owner",
      email: "owner@example.test",
      password: "test-password-123",
    };
    const firstBlocked = await request(closed, "/sign-up/email", credentials);
    assert.equal(firstBlocked.status, 403);
    assert.equal((await firstBlocked.json()).code, "SIGNUP_DISABLED");
    assert.equal((await db.select().from(user)).length, 0);
    const created = await request(open, "/sign-up/email", credentials);
    assert.equal(created.status, 200, await created.clone().text());
    assert.equal((await db.select().from(people)).length, 1);
    assert.ok((await db.select().from(categories)).length > 0);
    const login = await request(closed, "/sign-in/email", credentials);
    assert.equal(login.status, 200);
    assert.ok(login.headers.get("set-cookie"));
    const context = await closed.$context;
    await assert.rejects(
      context.internalAdapter.createUser(
        {
          name: "Bypass",
          email: "bypass@example.test",
          emailVerified: false,
        },
        { method: "email-password" },
      ),
    );

    async function mockGoogle(instance: typeof closed, email: string) {
      const authContext = await instance.$context;
      const google = authContext.socialProviders.find((provider) => provider.id === "google");
      assert.ok(google);
      google.idToken = { verify: async () => true };
      google.validateAuthorizationCode = async () => ({
        accessToken: "test-access",
        idToken: "test-id-token",
      });
      google.getUserInfo = async () => ({
        user: { email, name: "Google user", emailVerified: true },
        data: { sub: email, email, email_verified: true, name: "Google user" },
      });
    }
    await mockGoogle(open, "google-existing@example.test");
    const googleBody = { provider: "google", idToken: { token: "test-id-token" } };
    const googleCreated = await request(open, "/sign-in/social", googleBody);
    assert.equal(googleCreated.status, 200, await googleCreated.clone().text());
    await mockGoogle(closed, "google-existing@example.test");
    assert.equal((await request(closed, "/sign-in/social", googleBody)).status, 200);
    await mockGoogle(closed, "google-new@example.test");
    for (const requestSignUp of [false, true]) {
      const blockedGoogle = await request(closed, "/sign-in/social", {
        ...googleBody,
        requestSignUp,
      });
      assert.notEqual(blockedGoogle.status, 200);
    }
    // Exercise browser OAuth callbacks with real state cookies and a mocked provider.
    async function googleAuthorization() {
      const authorization = await request(closed, "/sign-in/social", {
        provider: "google",
        callbackURL: "http://localhost:7002/dashboard",
        errorCallbackURL: "http://localhost:7002/",
        disableRedirect: true,
        requestSignUp: true,
      });
      assert.equal(authorization.status, 200);
      const authorizationBody = await authorization.json();
      const state = new URL(authorizationBody.url).searchParams.get("state");
      assert.ok(state);
      return {
        state,
        cookie: authorization.headers
          .getSetCookie()
          .map((value) => value.split(";")[0])
          .join("; "),
      };
    }
    async function browserGoogleSignIn() {
      const { state, cookie } = await googleAuthorization();
      const callback = await closed.handler(
        new Request(
          `http://localhost:7002/api/auth/callback/google?code=test-code&state=${encodeURIComponent(state)}`,
          {
            headers: {
              cookie,
            },
          },
        ),
      );
      return callback;
    }
    const beforeInvalidCallbacks = (await db.select().from(user)).length;
    const google = (await closed.$context).socialProviders.find(
      (provider) => provider.id === "google",
    );
    assert.ok(google);
    const validateCode = google.validateAuthorizationCode;
    let invalidStateExchanges = 0;
    google.validateAuthorizationCode = async (...args) => {
      invalidStateExchanges++;
      return validateCode(...args);
    };
    try {
      for (const scenario of ["missing_cookie", "forged_state", "provider_denied"] as const) {
        const { state, cookie } = await googleAuthorization();
        const query = new URLSearchParams({
          state: scenario === "forged_state" ? "forged-oauth-state" : state,
          ...(scenario === "provider_denied" ? { error: "access_denied" } : { code: "test-code" }),
        });
        const rejected = await closed.handler(
          new Request(`http://localhost:7002/api/auth/callback/google?${query}`, {
            headers: scenario === "missing_cookie" ? {} : { cookie },
          }),
        );
        assert.equal(rejected.status, 302);
        assert.match(rejected.headers.get("location") ?? "", /error=/);
        assert.ok(
          !rejected.headers.getSetCookie().some((value) => /session_token=[^;]/.test(value)),
        );
      }
      assert.equal(invalidStateExchanges, 0);
      assert.equal((await db.select().from(user)).length, beforeInvalidCallbacks);
    } finally {
      google.validateAuthorizationCode = validateCode;
    }
    const untrustedRedirect = await request(closed, "/sign-in/social", {
      provider: "google",
      callbackURL: "https://untrusted.example.invalid/dashboard",
      disableRedirect: true,
    });
    assert.equal(untrustedRedirect.status, 403);
    const blockedCallback = await browserGoogleSignIn();
    assert.equal(blockedCallback.status, 302);
    assert.match(blockedCallback.headers.get("location") ?? "", /error=/);
    await mockGoogle(closed, "google-existing@example.test");
    const existingCallback = await browserGoogleSignIn();
    assert.equal(existingCallback.status, 302);
    assert.equal(existingCallback.headers.get("location"), "http://localhost:7002/dashboard");
    assert.ok(existingCallback.headers.get("set-cookie"));
    assert.equal((await db.select().from(user)).length, 2);
  } finally {
    await applicationPool?.end();
    for (const [key, value] of previous) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    await admin.query(`DROP DATABASE "${databaseName}"`);
    await admin.end();
  }
});
