import assert from "node:assert/strict";
import test from "node:test";

let createLatestRequestGuard;

try {
  ({ createLatestRequestGuard } =
    await import("../../src/features/map/lib/map-request-guard.ts"));
} catch {
  // RED: request ownership has not been extracted yet.
}

test("a newer request invalidates and aborts the previous request", () => {
  const guard = createLatestRequestGuard?.();
  const first = guard?.begin("token-a:default");
  const second = guard?.begin("token-a:default");

  assert.equal(first?.signal.aborted, true);
  assert.equal(first?.isCurrent(), false);
  assert.equal(second?.signal.aborted, false);
  assert.equal(second?.isCurrent(), true);
});

test("an authentication owner change prevents stale account results", () => {
  const guard = createLatestRequestGuard?.();
  const previousAccount = guard?.begin("token-a:bookmark");
  const nextAccount = guard?.begin("token-b:bookmark");

  assert.equal(previousAccount?.signal.aborted, true);
  assert.equal(previousAccount?.isCurrent(), false);
  assert.equal(nextAccount?.isCurrent(), true);
});

test("finish releases only the matching lease without aborting it", () => {
  const guard = createLatestRequestGuard?.();
  const lease = guard?.begin("token-a:default");

  lease?.finish();
  lease?.finish();

  assert.equal(lease?.signal.aborted, false);
  assert.equal(lease?.isCurrent(), false);
});

test("dispose aborts the active request and is idempotent", () => {
  const guard = createLatestRequestGuard?.();
  const lease = guard?.begin("token-a:default");

  guard?.dispose();
  guard?.dispose();

  assert.equal(lease?.signal.aborted, true);
  assert.equal(lease?.isCurrent(), false);
});
