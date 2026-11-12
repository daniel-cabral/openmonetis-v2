import assert from "node:assert/strict";
import test from "node:test";
import {
  buildLandingHead,
  buildRobotsTxt,
  hasSessionCookie,
  isLandingPageEnabled,
} from "./landing.presentation";

test("landing page is enabled only by the literal true value", () => {
  assert.equal(isLandingPageEnabled("true"), true);
  assert.equal(isLandingPageEnabled(" TRUE "), true);
  for (const value of [undefined, "", "1", "false", "yes"]) {
    assert.equal(isLandingPageEnabled(value), false, String(value));
  }
});

test("session cookie detection accepts both names and ignores empty or look-alike cookies", () => {
  assert.equal(hasSessionCookie("theme=dark; better-auth.session_token=abc"), true);
  assert.equal(hasSessionCookie("__Secure-better-auth.session_token=abc; theme=dark"), true);
  assert.equal(hasSessionCookie("better-auth.session_token="), false);
  assert.equal(hasSessionCookie("my-better-auth.session_token=abc"), false);
  assert.equal(hasSessionCookie("better-auth.session_token_old=abc"), false);
  assert.equal(hasSessionCookie(null), false);
  assert.equal(hasSessionCookie(undefined), false);
});

test("robots rules allow only the landing address when it is enabled", () => {
  assert.equal(buildRobotsTxt(false), "User-agent: *\nDisallow: /\n");
  assert.equal(buildRobotsTxt(true), "User-agent: *\nAllow: /$\nDisallow: /\n");
});

test("landing head points canonical and social tags to the request origin", () => {
  const head = buildLandingHead("https://x.test");
  assert.equal(head.links.find((item) => item.rel === "canonical")?.href, "https://x.test/");
  assert.deepEqual(
    head.meta.find((item) => "property" in item && item.property === "og:url"),
    { property: "og:url", content: "https://x.test/" },
  );
  assert.deepEqual(
    head.meta.find((item) => "property" in item && item.property === "og:image"),
    { property: "og:image", content: "https://x.test/icon-512.png" },
  );
  assert.deepEqual(
    head.meta.find((item) => "name" in item && item.name === "robots"),
    { name: "robots", content: "index, follow" },
  );
});
