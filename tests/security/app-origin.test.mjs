import assert from "node:assert/strict";
import test from "node:test";

let parseAppOrigin;
let getInternalEmbeddingsProcessUrl;
let getSafeOAuthRedirectUrl;
let resolveAppOrigin;

try {
  ({
    parseAppOrigin,
    getInternalEmbeddingsProcessUrl,
    getSafeOAuthRedirectUrl,
    resolveAppOrigin,
  } = await import("../../src/shared/lib/app-origin.ts"));
} catch {
  // RED: canonical application origin validation does not exist yet.
}

test("rejects a missing canonical APP_ORIGIN", () => {
  assert.deepEqual(parseAppOrigin?.(undefined), {
    ok: false,
    error: "APP_ORIGIN is not configured",
  });
});

test("rejects values that are not an exact HTTPS or loopback HTTP origin", () => {
  const invalidOrigins = [
    "example.com",
    "ftp://example.com",
    "http://example.com",
    "https://user:password@example.com",
    "https://example.com/internal",
    "https://example.com?redirect=attacker",
    " https://example.com",
  ];

  for (const value of invalidOrigins) {
    assert.deepEqual(parseAppOrigin(value), {
      ok: false,
      error: "APP_ORIGIN must be an exact HTTPS origin",
    });
  }
});

test("builds the internal worker URL only from the canonical origin", () => {
  assert.equal(
    getInternalEmbeddingsProcessUrl?.("https://pinpaw.example", 20),
    "https://pinpaw.example/api/v1/internal/embeddings/process?batch=20"
  );
  assert.equal(
    getInternalEmbeddingsProcessUrl?.("https://pinpaw.example/path", 20),
    null
  );
});

test("keeps OAuth redirects inside the canonical application origin", () => {
  const appOrigin = "https://pinpaw.example";
  const maliciousRedirects = [
    "https://attacker.example/steal",
    "//attacker.example/steal",
    "/\\attacker.example/steal",
    "javascript:alert(1)",
  ];

  assert.equal(
    getSafeOAuthRedirectUrl?.(appOrigin, "/my?tab=lost"),
    "https://pinpaw.example/my?tab=lost"
  );
  for (const redirect of maliciousRedirects) {
    assert.equal(
      getSafeOAuthRedirectUrl?.(appOrigin, redirect),
      "https://pinpaw.example/"
    );
  }
  assert.equal(getSafeOAuthRedirectUrl?.(undefined, "/my"), null);
});

test("development can fall back to the request origin when APP_ORIGIN is missing", () => {
  const previous = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    assert.deepEqual(resolveAppOrigin?.(undefined, "http://localhost:3000"), {
      ok: true,
      origin: "http://localhost:3000",
    });
    assert.equal(
      getSafeOAuthRedirectUrl?.(undefined, "/my", "http://localhost:3000"),
      "http://localhost:3000/my"
    );
  } finally {
    process.env.NODE_ENV = previous;
  }
});
