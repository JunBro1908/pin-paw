import assert from "node:assert/strict";
import test from "node:test";

import {
  REQUIRED_READINESS_ENV,
  checkOperationalReadiness,
} from "../../src/shared/lib/operational-health.ts";

const configuredEnvironment = Object.fromEntries(
  REQUIRED_READINESS_ENV.map((key) => [key, `configured-${key}`])
);

test("readiness fails closed before probing when required configuration is absent", async () => {
  let probes = 0;
  const result = await checkOperationalReadiness(
    {
      ...configuredEnvironment,
      OPENAI_API_KEY: " ",
      NEXT_PUBLIC_NAVER_SECRET: undefined,
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
    missingConfiguration: ["NEXT_PUBLIC_NAVER_SECRET", "OPENAI_API_KEY"],
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
