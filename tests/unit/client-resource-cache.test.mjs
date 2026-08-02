import assert from "node:assert/strict";
import test from "node:test";

const { createAuthenticatedListCache } =
  await import("../../src/shared/lib/client-resource-cache.ts");

test("authenticated list cache reuses fresh entries and dedupes in-flight loads", async () => {
  let calls = 0;
  const cache = createAuthenticatedListCache({
    key: "test",
    ttlMs: 60_000,
    fetcher: async () => {
      calls += 1;
      await new Promise((resolve) => setTimeout(resolve, 10));
      return ["a", "b"];
    },
  });

  const [first, second] = await Promise.all([
    cache.load("token"),
    cache.load("token"),
  ]);
  assert.deepEqual(first, ["a", "b"]);
  assert.deepEqual(second, ["a", "b"]);
  assert.equal(calls, 1);
  assert.deepEqual(cache.peek("token"), ["a", "b"]);
  assert.equal(cache.isFresh("token"), true);

  await cache.load("token");
  assert.equal(calls, 1);

  await cache.load("token", { force: true });
  assert.equal(calls, 2);

  cache.invalidate();
  assert.equal(cache.peek("token"), null);
});
