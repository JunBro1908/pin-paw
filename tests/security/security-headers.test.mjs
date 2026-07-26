import assert from "node:assert/strict";
import test from "node:test";

import { unstable_getResponseFromNextConfig } from "next/experimental/testing/server.js";

test("applies the public application security headers", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://security-test-project.supabase.co";
  process.env.NEXT_PUBLIC_SENTRY_DSN =
    "https://publickey@o123.ingest.sentry.io/456";
  const { default: nextConfig } = await import(
    `../../next.config.ts?security-headers=${Date.now()}`
  );
  const response = await unstable_getResponseFromNextConfig({
    url: "https://pinpaw.example/map",
    nextConfig,
  });

  assert.equal(response.headers.get("x-content-type-options"), "nosniff");
  assert.equal(response.headers.get("x-frame-options"), "DENY");
  assert.equal(
    response.headers.get("referrer-policy"),
    "strict-origin-when-cross-origin"
  );
  assert.equal(
    response.headers.get("permissions-policy"),
    "camera=(), microphone=(), geolocation=(self), browsing-topics=()"
  );

  const csp = response.headers.get("content-security-policy");
  assert.match(csp ?? "", /frame-ancestors 'none'/);
  assert.match(csp ?? "", /object-src 'none'/);
  assert.match(csp ?? "", /https:\/\/openapi\.map\.naver\.com/);
  assert.match(csp ?? "", /https:\/\/oapi\.map\.naver\.com/);
  assert.match(csp ?? "", /https:\/\/\*\.map\.naver\.net/);
  assert.match(csp ?? "", /https:\/\/\*\.naver\.net/);
  assert.match(csp ?? "", /https:\/\/\*\.pstatic\.net/);
  assert.match(csp ?? "", /https:\/\/security-test-project\.supabase\.co/);
  assert.match(csp ?? "", /https:\/\/o123\.ingest\.sentry\.io/);
  assert.doesNotMatch(csp ?? "", /publickey|\/456/);
  assert.doesNotMatch(csp ?? "", /ivwzvwuqhxqphyqaanry/);
  assert.equal(
    nextConfig.images?.remotePatterns?.[0]?.hostname,
    "security-test-project.supabase.co"
  );
});

test("rejects an invalid Supabase project origin at configuration time", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://example.com/path?redirect=unsafe";

  await assert.rejects(
    import(`../../next.config.ts?invalid-supabase-origin=${Date.now()}`),
    /NEXT_PUBLIC_SUPABASE_URL/
  );
});

test("rejects a non-Sentry monitoring DSN at configuration time", async () => {
  process.env.NEXT_PUBLIC_SUPABASE_URL =
    "https://security-test-project.supabase.co";
  process.env.NEXT_PUBLIC_SENTRY_DSN =
    "https://publickey@example.com/456?forward=unsafe";

  await assert.rejects(
    import(`../../next.config.ts?invalid-sentry-origin=${Date.now()}`),
    /NEXT_PUBLIC_SENTRY_DSN/
  );
});
