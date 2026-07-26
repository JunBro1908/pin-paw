import assert from "node:assert/strict";
import test from "node:test";

let readJsonBody;

try {
  ({ readJsonBody } = await import("../../src/shared/lib/api-request.ts"));
} catch {
  // RED: bounded request-body reader does not exist yet.
}

test("reads valid JSON within the actual byte limit", async () => {
  const result = await readJsonBody?.(
    new Request("https://example.test/api", {
      method: "POST",
      body: JSON.stringify({ name: "보리" }),
    }),
    64
  );

  assert.deepEqual(result, { ok: true, value: { name: "보리" } });
});

test("rejects malformed and empty JSON bodies", async () => {
  const malformed = await readJsonBody?.(
    new Request("https://example.test/api", {
      method: "POST",
      body: "{",
    }),
    64
  );
  const empty = await readJsonBody?.(
    new Request("https://example.test/api", { method: "POST" }),
    64
  );

  assert.deepEqual(malformed, { ok: false, reason: "invalid_json" });
  assert.deepEqual(empty, { ok: false, reason: "invalid_json" });
});

test("rejects forged declarations and actual bodies over the byte limit", async () => {
  const declared = await readJsonBody?.(
    new Request("https://example.test/api", {
      method: "POST",
      headers: { "Content-Length": "1000" },
      body: "{}",
    }),
    64
  );
  const actual = await readJsonBody?.(
    new Request("https://example.test/api", {
      method: "POST",
      body: JSON.stringify({ value: "가".repeat(30) }),
    }),
    64
  );

  assert.deepEqual(declared, { ok: false, reason: "body_too_large" });
  assert.deepEqual(actual, { ok: false, reason: "body_too_large" });
});
