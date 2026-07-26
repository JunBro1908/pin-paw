import assert from "node:assert/strict";
import { spawn } from "node:child_process";

const port = 3117;
const baseUrl = `http://127.0.0.1:${port}`;
const nextBin = "node_modules/next/dist/bin/next";
let serverOutput = "";

const server = spawn(
  process.execPath,
  [nextBin, "start", "--hostname", "127.0.0.1", "--port", String(port)],
  {
    env: {
      ...process.env,
      NODE_ENV: "production",
      NEXT_PUBLIC_SUPABASE_URL: "https://ci-placeholder.supabase.co",
      NEXT_PUBLIC_SUPABASE_ANON_KEY: "ci-anon-key",
      SUPABASE_SERVICE_ROLE_KEY: "ci-service-role-key",
      NEXT_PUBLIC_NAVER_CLIENT_ID: "ci-naver-client-id",
      APP_ORIGIN: "https://pinpaw-ci.example",
      CRON_SECRET: "integration-cron-secret",
    },
    stdio: ["ignore", "pipe", "pipe"],
  }
);

server.stdout.on("data", (chunk) => {
  serverOutput += chunk;
});
server.stderr.on("data", (chunk) => {
  serverOutput += chunk;
});

async function waitForServer() {
  const deadline = Date.now() + 15_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) {
      throw new Error(`Next server exited early:\n${serverOutput}`);
    }
    try {
      await fetch(baseUrl);
      return;
    } catch {
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
  }
  throw new Error(`Next server did not become ready:\n${serverOutput}`);
}

async function expectStatus(path, init, expectedStatus) {
  const response = await fetch(`${baseUrl}${path}`, init);
  assert.equal(
    response.status,
    expectedStatus,
    `${path}: expected ${expectedStatus}, got ${response.status}`
  );
  return response;
}

try {
  await waitForServer();

  await expectStatus(
    "/api/v1/uploads/presign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{",
    },
    400
  );
  await expectStatus(
    "/api/v1/uploads/presign",
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ value: "x".repeat(70_000) }),
    },
    413
  );
  await expectStatus(
    "/api/v1/public/map/clusters?minLat=37.5evil&minLng=126.8&maxLat=37.7&maxLng=127.1&zoom=13",
    undefined,
    400
  );
  await expectStatus("/api/v1/internal/embeddings/process", undefined, 401);
  await expectStatus("/api/v1/internal/uploads/cleanup", undefined, 401);

  const requestIdResponse = await expectStatus(
    "/api/v1/public/map/clusters?minLat=invalid",
    { headers: { "x-request-id": "attacker-controlled-value" } },
    400
  );
  const requestId = requestIdResponse.headers.get("x-request-id");
  assert.match(
    requestId ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
  assert.notEqual(requestId, "attacker-controlled-value");

  const healthResponse = await expectStatus("/api/v1/health", undefined, 200);
  assert.match(healthResponse.headers.get("cache-control") ?? "", /no-store/);
  assert.match(
    healthResponse.headers.get("x-request-id") ?? "",
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );

  const readinessResponse = await expectStatus(
    "/api/v1/readiness",
    undefined,
    503
  );
  assert.match(readinessResponse.headers.get("cache-control") ?? "", /no-store/);
  const readinessBody = JSON.stringify(await readinessResponse.json());
  assert.doesNotMatch(
    readinessBody,
    /OPENAI_API_KEY|NAVER_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY/
  );

  console.log("HTTP boundary integration checks passed (8/8)");
} finally {
  server.kill("SIGTERM");
}
