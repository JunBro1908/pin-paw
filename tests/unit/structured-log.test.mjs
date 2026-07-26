import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

import {
  createLogger,
  createRequestLogger,
  createStructuredLogEntry,
  observeApiRequest,
} from "../../src/shared/lib/structured-log.ts";

test("structured logs preserve operational fields and redact sensitive values", () => {
  const entry = createStructuredLogEntry("error", "upload.intent_failed", {
    level: "info",
    event: "attacker.event",
    timestamp: "attacker-time",
    requestId: "018f47f0-8d65-7cc1-a7ec-4c8f8ff7e000",
    route: "/api/v1/uploads/presign",
    status: 500,
    timedOut: false,
    authorization: "Bearer secret-access-token",
    cookie: "session=secret-cookie",
    note: "private sighting note",
    lat: 37.5665,
    lng: 126.978,
    ip: "203.0.113.10",
    error: {
      name: "PostgrestError",
      code: "42501",
      message: "token=secret-database-message",
      details: "private row details",
    },
  });

  assert.equal(entry.level, "error");
  assert.equal(entry.event, "upload.intent_failed");
  assert.notEqual(entry.timestamp, "attacker-time");
  assert.equal(entry.requestId, "018f47f0-8d65-7cc1-a7ec-4c8f8ff7e000");
  assert.equal(entry.route, "/api/v1/uploads/presign");
  assert.equal(entry.status, 500);
  assert.equal(entry.timedOut, false);
  assert.deepEqual(entry.error, {
    name: "PostgrestError",
    code: "42501",
  });

  const serialized = JSON.stringify(entry);
  for (const secret of [
    "secret-access-token",
    "secret-cookie",
    "private sighting note",
    "37.5665",
    "126.978",
    "203.0.113.10",
    "secret-database-message",
    "private row details",
  ]) {
    assert.doesNotMatch(serialized, new RegExp(secret.replace(".", "\\.")));
  }
});

test("structured logs bound untrusted strings and remove control characters", () => {
  const entry = createStructuredLogEntry("warn", "upstream.failed", {
    requestId: "018f47f0-8d65-7cc1-a7ec-4c8f8ff7e000",
    upstream: `naver\n${"x".repeat(500)}`,
  });

  assert.equal(typeof entry.upstream, "string");
  assert.ok(entry.upstream.length <= 200);
  assert.doesNotMatch(entry.upstream, /[\r\n]/);
});

test("request logger emits one redacted JSON line with the proxy request ID", () => {
  const lines = [];
  const request = new Request("https://pinpaw.example/api/v1/sightings", {
    headers: {
      "x-request-id": "018f47f0-8d65-4cc1-a7ec-4c8f8ff7e000",
    },
  });
  const logger = createRequestLogger(
    request,
    "/api/v1/sightings",
    (level, line) => lines.push({ level, line })
  );

  logger.error("sighting.create_failed", {
    error: new Error("secret provider response"),
    status: 500,
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "error");
  const entry = JSON.parse(lines[0].line);
  assert.equal(entry.requestId, "018f47f0-8d65-4cc1-a7ec-4c8f8ff7e000");
  assert.equal(entry.route, "/api/v1/sightings");
  assert.equal(entry.event, "sighting.create_failed");
  assert.deepEqual(entry.error, { name: "Error" });
  assert.doesNotMatch(lines[0].line, /secret provider response/);
});

test("request logger replaces a missing or malformed request ID", () => {
  const logger = createRequestLogger(
    new Request("https://pinpaw.example/api/v1/sightings", {
      headers: { "x-request-id": "not-a-uuid" },
    }),
    "/api/v1/sightings",
    () => {}
  );

  assert.match(
    logger.requestId,
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
  );
});

test("background logger emits through the same redacting JSON sink", () => {
  const lines = [];
  const logger = createLogger(
    {
      component: "embeddings_worker_trigger",
      requestId: "018f47f0-8d65-4cc1-a7ec-4c8f8ff7e000",
    },
    (level, line) => lines.push({ level, line })
  );

  logger.warn("embedding.trigger_failed", {
    error: new Error("Bearer leaked-provider-token"),
    status: 503,
  });

  assert.equal(lines.length, 1);
  assert.equal(lines[0].level, "warn");
  const entry = JSON.parse(lines[0].line);
  assert.equal(entry.component, "embeddings_worker_trigger");
  assert.equal(entry.requestId, "018f47f0-8d65-4cc1-a7ec-4c8f8ff7e000");
  assert.deepEqual(entry.error, { name: "Error" });
  assert.doesNotMatch(lines[0].line, /leaked-provider-token/);
});

test("API routes do not bypass the structured log sink", async () => {
  const apiRoot = path.resolve("src/app/api");
  const pending = [apiRoot];
  const routeFiles = [];

  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      if (entry.isFile() && entry.name === "route.ts") routeFiles.push(target);
    }
  }

  assert.ok(routeFiles.length > 0);
  for (const routeFile of routeFiles) {
    const source = await readFile(routeFile, "utf8");
    assert.doesNotMatch(
      source,
      /\bconsole\.(?:debug|error|info|log|warn)\s*\(/,
      `${path.relative(process.cwd(), routeFile)} bypasses structured logging`
    );
  }
});

test("request logger reports handled server errors with correlation context", () => {
  const reports = [];
  const originalError = new Error("private upstream response");
  const request = new Request("https://pinpaw.example/api/v1/sightings", {
    headers: {
      "x-request-id": "018f47f0-8d65-4cc1-a7ec-4c8f8ff7e000",
    },
  });
  const logger = createRequestLogger(
    request,
    "/api/v1/sightings",
    () => {},
    (error, event, context) => reports.push({ error, event, context })
  );

  logger.error("sighting.create_failed", {
    error: originalError,
    status: 500,
    note: "private note",
  });

  assert.equal(reports.length, 1);
  assert.equal(reports[0].error, originalError);
  assert.equal(reports[0].event, "sighting.create_failed");
  assert.equal(
    reports[0].context.requestId,
    "018f47f0-8d65-4cc1-a7ec-4c8f8ff7e000"
  );
  assert.equal(reports[0].context.route, "/api/v1/sightings");
  assert.equal(reports[0].context.status, 500);
  assert.equal(reports[0].context.note, "[REDACTED]");
});

test("API observation emits consistent RED fields without identifier labels", async () => {
  const lines = [];
  const observations = [];
  const request = new Request(
    `https://pinpaw.example/api/v1/lost-posts/${crypto.randomUUID()}`,
    { method: "PATCH" }
  );

  const response = await observeApiRequest(
    request,
    {
      routeClass: "member.write",
      route: "/api/v1/lost-posts/[lostPostId]",
    },
    async () => Response.json({ ok: true }, { status: 202 }),
    {
      sink: (level, line) => lines.push({ level, line }),
      record: async (observation) => observations.push(observation),
      now: (() => {
        const values = [1000, 1123];
        return () => values.shift();
      })(),
      trace: async (_context, callback) => callback(),
    }
  );

  assert.equal(response.status, 202);
  assert.deepEqual(observations, [
    {
      routeClass: "member.write",
      method: "PATCH",
      status: 202,
      durationMs: 123,
    },
  ]);
  const entry = JSON.parse(lines[0].line);
  assert.equal(entry.event, "api.request.completed");
  assert.equal(entry.routeClass, "member.write");
  assert.equal(entry.method, "PATCH");
  assert.equal(entry.status, 202);
  assert.equal(entry.durationMs, 123);
  assert.doesNotMatch(lines[0].line, /[0-9a-f]{8}-[0-9a-f]{4}-/i);
});

test("API observation records thrown handlers as 500 and rethrows", async () => {
  const observations = [];
  const failure = new Error("private failure");

  await assert.rejects(
    observeApiRequest(
      new Request("https://pinpaw.example/api/v1/internal/work", {
        method: "POST",
      }),
      { routeClass: "internal.write", route: "/api/v1/internal/work" },
      async () => {
        throw failure;
      },
      {
        sink: () => {},
        record: async (observation) => observations.push(observation),
        now: (() => {
          const values = [10, 20];
          return () => values.shift();
        })(),
        trace: async (_context, callback) => callback(),
      }
    ),
    failure
  );

  assert.deepEqual(observations, [
    {
      routeClass: "internal.write",
      method: "POST",
      status: 500,
      durationMs: 10,
    },
  ]);
});
