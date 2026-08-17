import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_READINESS_ENV,
  checkOperationalReadiness,
} from "../../src/shared/lib/operational-health.ts";

const configuredEnvironment = Object.fromEntries(
  REQUIRED_READINESS_ENV.map((key) => [key, `configured-${key}`])
);
configuredEnvironment.APP_ORIGIN = "https://pinpaw.example";

test("readiness fails closed before probing when required configuration is absent", async () => {
  let probes = 0;
  const result = await checkOperationalReadiness(
    {
      ...configuredEnvironment,
      OPENAI_API_KEY: " ",
      NAVER_CLIENT_SECRET: undefined,
    },
    async () => {
      probes += 1;
      return { error: null };
    }
  );

  assert.equal(probes, 0);
  assert.deepEqual(result, {
    ready: false,
    reason: "configuration_missing",
    missingConfiguration: ["NAVER_CLIENT_SECRET", "OPENAI_API_KEY"],
  });
});

test("readiness reports a dependency failure without returning its raw error", async () => {
  const upstreamError = new Error("database response containing a secret");
  const result = await checkOperationalReadiness(
    configuredEnvironment,
    async () => ({ error: upstreamError })
  );

  assert.equal(result.ready, false);
  assert.equal(result.reason, "dependency_unavailable");
  assert.equal(result.error, upstreamError);
  assert.equal("message" in result, false);
});

test("readiness succeeds only after the dependency probe succeeds", async () => {
  const result = await checkOperationalReadiness(
    configuredEnvironment,
    async () => ({ error: null })
  );

  assert.deepEqual(result, { ready: true });
});

test("readiness rejects an invalid non-canonical APP_ORIGIN before probing", async () => {
  const environment = {
    APP_ORIGIN: "http://pinpaw.co.kr",
    CRON_SECRET: "cron",
    NEXT_PUBLIC_NAVER_CLIENT_ID: "naver-client",
    NEXT_PUBLIC_NAVER_MAP_CLIENT_ID: "naver-map",
    NAVER_CLIENT_SECRET: "naver-secret",
    NEXT_PUBLIC_SENTRY_DSN: "https://public@o1.ingest.sentry.io/1",
    NEXT_PUBLIC_SUPABASE_ANON_KEY: "anon",
    NEXT_PUBLIC_SUPABASE_URL: "https://example.supabase.co",
    OPENAI_API_KEY: "openai",
    SENTRY_DSN: "https://public@o1.ingest.sentry.io/1",
    SUPABASE_SERVICE_ROLE_KEY: "service",
  };
  let probed = false;

  const result = await checkOperationalReadiness(environment, async () => {
    probed = true;
    return { error: null };
  });

  assert.deepEqual(result, {
    ready: false,
    reason: "configuration_missing",
    missingConfiguration: ["APP_ORIGIN"],
  });
  assert.equal(probed, false);
});
