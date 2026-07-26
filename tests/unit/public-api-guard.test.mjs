import assert from "node:assert/strict";
import test from "node:test";

let normalizeSearchQuery;
let validateMapViewport;
let parseMapViewportQuery;
let extractTrustedClientIp;

try {
  ({ normalizeSearchQuery, validateMapViewport, parseMapViewportQuery } =
    await import("../../src/shared/lib/public-api-guard.ts"));
  ({ extractTrustedClientIp } =
    await import("../../src/shared/lib/client-ip.ts"));
} catch {
  // RED: public cost and proxy trust boundaries do not exist yet.
}

test("accepts bounded search text and rejects oversized or control input", () => {
  assert.deepEqual(normalizeSearchQuery?.("  서울역  "), {
    ok: true,
    query: "서울역",
  });
  assert.deepEqual(normalizeSearchQuery?.("x".repeat(81)), {
    ok: false,
    reason: "query_too_long",
  });
  assert.deepEqual(normalizeSearchQuery?.("서울\u0000역"), {
    ok: false,
    reason: "query_invalid",
  });
});

test("rejects world-scale map sweeps while preserving normal viewports", () => {
  assert.deepEqual(
    validateMapViewport?.({
      minLat: 37.5,
      minLng: 126.8,
      maxLat: 37.7,
      maxLng: 127.1,
      zoom: 13,
    }),
    { ok: true }
  );
  assert.deepEqual(
    validateMapViewport?.({
      minLat: 30,
      minLng: 120,
      maxLat: 40,
      maxLng: 130,
      zoom: 13,
    }),
    { ok: false, reason: "bbox_too_large" }
  );
});

test("map query parsing rejects numeric prefixes and fractional zoom", () => {
  assert.deepEqual(
    parseMapViewportQuery?.({
      minLat: "37.5",
      minLng: "126.8",
      maxLat: "37.7",
      maxLng: "127.1",
      zoom: "13",
    }),
    {
      ok: true,
      viewport: {
        minLat: 37.5,
        minLng: 126.8,
        maxLat: 37.7,
        maxLng: 127.1,
        zoom: 13,
      },
    }
  );
  assert.equal(
    parseMapViewportQuery?.({
      minLat: "37.5evil",
      minLng: "126.8",
      maxLat: "37.7",
      maxLng: "127.1",
      zoom: "13",
    }).ok,
    false
  );
  assert.equal(
    parseMapViewportQuery?.({
      minLat: "37.5",
      minLng: "126.8",
      maxLat: "37.7",
      maxLng: "127.1",
      zoom: "13.5",
    }).ok,
    false
  );
});

test("trusts Vercel-overwritten forwarding headers only on Vercel", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "203.0.113.7",
    "x-forwarded-for": "198.51.100.4",
  });

  assert.equal(extractTrustedClientIp?.(headers, true), "203.0.113.7");
  assert.equal(extractTrustedClientIp?.(headers, false), "unknown");
});

test("rejects malformed forwarded IP values", () => {
  const headers = new Headers({
    "x-vercel-forwarded-for": "not-an-ip, 203.0.113.7",
  });

  assert.equal(extractTrustedClientIp?.(headers, true), "unknown");
});
