import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(path, "utf8");
}

test("Sentry initializes in client, Node, and Edge with the privacy sanitizer", async () => {
  const [client, server, edge] = await Promise.all([
    source("src/instrumentation-client.ts"),
    source("sentry.server.config.ts"),
    source("sentry.edge.config.ts"),
  ]);

  for (const config of [client, server, edge]) {
    assert.match(config, /sendDefaultPii:\s*false/);
    assert.match(config, /sanitizeMonitoringEvent/);
    assert.match(config, /sanitizeMonitoringSpan/);
    assert.doesNotMatch(config, /replayIntegration|recordInputs|recordOutputs/);
  }
  assert.match(client, /captureRouterTransitionStart/);
});

test("Next instrumentation captures request and React boundary errors", async () => {
  const [instrumentation, boundary, globalBoundary] = await Promise.all([
    source("src/instrumentation.ts"),
    source("src/app/error.tsx"),
    source("src/app/global-error.tsx"),
  ]);

  assert.match(instrumentation, /captureRequestError/);
  assert.match(instrumentation, /sentry\.server\.config/);
  assert.match(instrumentation, /sentry\.edge\.config/);
  assert.match(boundary, /captureException/);
  assert.match(globalBoundary, /captureException/);
  assert.doesNotMatch(boundary, /\bconsole\./);
  assert.doesNotMatch(globalBoundary, /\bconsole\./);
});

test("Sentry build integration avoids a public tunnel and requires both DSNs", async () => {
  const [nextConfig, readiness] = await Promise.all([
    source("next.config.ts"),
    source("src/shared/lib/operational-health.ts"),
  ]);

  assert.match(nextConfig, /withSentryConfig/);
  assert.match(nextConfig, /sourcemaps:\s*\{/);
  assert.doesNotMatch(nextConfig, /tunnelRoute/);
  assert.match(readiness, /NEXT_PUBLIC_SENTRY_DSN/);
  assert.match(readiness, /SENTRY_DSN/);
});
