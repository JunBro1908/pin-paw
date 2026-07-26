import assert from "node:assert/strict";
import test from "node:test";

let createInitialMapDataState;
let getMapDataView;
let mapDataReducer;

try {
  ({ createInitialMapDataState, getMapDataView, mapDataReducer } =
    await import("../../src/features/map/lib/map-data-state.ts"));
} catch {
  // RED: map request results are still written directly into component state.
}

test("ignores a cluster result owned by a superseded account request", () => {
  const initial = createInitialMapDataState();
  const accountA = mapDataReducer(initial, {
    type: "begin",
    principalKey: "token-a",
    ownerKey: "token-a:default:viewport",
  });
  const accountB = mapDataReducer(accountA, {
    type: "begin",
    principalKey: "token-b",
    ownerKey: "token-b:default:viewport",
  });
  const stale = mapDataReducer(accountB, {
    type: "resolve-clusters",
    ownerKey: "token-a:default:viewport",
    rawItems: [{ type: "point", id: "private-a", lat: 37.5, lng: 127 }],
    items: [{ type: "point", id: "private-a", lat: 37.5, lng: 127 }],
    feedback: { "private-a": { seen: true, claimed: true } },
  });

  assert.deepEqual(stale, accountB);
});

test("accepts only the current owner result and clears a prior error", () => {
  const ownerKey = "token-b:default:viewport";
  const initial = {
    ...createInitialMapDataState(),
    error: "previous failure",
  };
  const loading = mapDataReducer(initial, {
    type: "begin",
    principalKey: "token-b",
    ownerKey,
  });
  const result = mapDataReducer(loading, {
    type: "resolve-clusters",
    ownerKey,
    rawItems: [{ type: "point", id: "current", lat: 37.5, lng: 127 }],
    items: [{ type: "point", id: "current", lat: 37.5, lng: 127 }],
    feedback: { current: { seen: false, claimed: false } },
  });

  assert.equal(result.loading, false);
  assert.equal(result.error, null);
  assert.equal(result.items[0].id, "current");
});

test("does not replace bookmark data with a late failure", () => {
  const currentOwner = "token-b:bookmark";
  const initial = createInitialMapDataState();
  const loadingA = mapDataReducer(initial, {
    type: "begin",
    principalKey: "token-a",
    ownerKey: "token-a:bookmark",
  });
  const loadingB = mapDataReducer(loadingA, {
    type: "begin",
    principalKey: "token-b",
    ownerKey: currentOwner,
  });
  const current = mapDataReducer(loadingB, {
    type: "resolve-bookmark",
    ownerKey: currentOwner,
    lostPosts: [{ id: "lost-b", lat: 37.5, lng: 127 }],
    paths: [
      {
        lost_post_id: "lost-b",
        lost_lat: 37.5,
        lost_lng: 127,
        lost_at: "2026-07-25T00:00:00.000Z",
        points: [
          {
            sighting_id: " SIGHTING-B ",
            lat: 37.6,
            lng: 127.1,
            occurred_at: "2026-07-25T01:00:00.000Z",
          },
        ],
      },
    ],
  });
  const staleFailure = mapDataReducer(current, {
    type: "fail",
    ownerKey: "token-a:bookmark",
    error: "late failure",
  });

  assert.deepEqual(staleFailure, current);
  assert.deepEqual(current.feedback["sighting-b"], {
    seen: false,
    claimed: true,
  });
});

test("reset removes account-bound snapshots", () => {
  const state = {
    ...createInitialMapDataState(),
    principalKey: "token-a",
    ownerKey: "token-a:bookmark",
    rawItems: [{ type: "point", id: "private-a", lat: 37.5, lng: 127 }],
    items: [{ type: "point", id: "private-a", lat: 37.5, lng: 127 }],
    feedback: { "private-a": { seen: true, claimed: true } },
    lostPosts: [{ id: "lost-a", lat: 37.5, lng: 127 }],
  };

  assert.deepEqual(mapDataReducer(state, { type: "reset" }), {
    principalKey: null,
    ownerKey: null,
    loading: false,
    rawItems: [],
    items: [],
    feedback: {},
    lostPosts: [],
    paths: [],
    error: null,
  });
});

test("returns an empty view immediately when the principal changes", () => {
  const accountAState = {
    ...createInitialMapDataState(),
    principalKey: "token-a",
    ownerKey: "token-a:default:viewport",
    items: [{ type: "point", id: "private-a", lat: 37.5, lng: 127 }],
  };

  assert.equal(getMapDataView?.("token-a", accountAState), accountAState);
  assert.deepEqual(getMapDataView?.("token-b", accountAState), {
    ...createInitialMapDataState(),
    principalKey: "token-b",
  });
});

test("patch-feedback updates claimed without requiring ownerKey", () => {
  const state = {
    ...createInitialMapDataState(),
    principalKey: "token-a",
    ownerKey: "token-a:default:viewport",
    feedback: { "abc-1": { seen: true, claimed: false } },
  };

  const next = mapDataReducer(state, {
    type: "patch-feedback",
    sightingId: "ABC-1",
    claimed: true,
  });

  assert.deepEqual(next.feedback["abc-1"], { seen: true, claimed: true });
});

test("hydrate keeps loading true while settle clears it without replacing items", () => {
  const ownerKey = "token-a:default:viewport";
  const loading = mapDataReducer(createInitialMapDataState(), {
    type: "begin",
    principalKey: "token-a",
    ownerKey,
  });
  const hydrated = mapDataReducer(loading, {
    type: "hydrate-clusters",
    ownerKey,
    rawItems: [{ type: "point", id: "cached", lat: 37.5, lng: 127 }],
    items: [{ type: "point", id: "cached", lat: 37.5, lng: 127 }],
    feedback: {},
  });
  assert.equal(hydrated.loading, true);
  assert.equal(hydrated.items[0].id, "cached");

  const settled = mapDataReducer(hydrated, { type: "settle", ownerKey });
  assert.equal(settled.loading, false);
  assert.equal(settled.items[0].id, "cached");
  assert.equal(settled.error, null);
});
