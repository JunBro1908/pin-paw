import assert from "node:assert/strict";
import test from "node:test";

let getAuthenticatedListView;

try {
  ({ getAuthenticatedListView } =
    await import("../../src/shared/lib/authenticated-list.ts"));
} catch {
  // RED: token-bound list state does not exist yet.
}

test("does not expose a previous account snapshot after the token changes", () => {
  const previousSnapshot = {
    accessToken: "previous-token",
    items: [{ id: "private-item" }],
    error: null,
  };

  assert.deepEqual(getAuthenticatedListView?.("new-token", previousSnapshot), {
    loading: true,
    items: [],
    error: null,
  });
  assert.deepEqual(getAuthenticatedListView?.(undefined, previousSnapshot), {
    loading: false,
    items: [],
    error: null,
  });
});
