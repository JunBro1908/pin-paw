import assert from "node:assert/strict";
import test from "node:test";

let mapDomain = {};

try {
  mapDomain = await import("../../src/features/map/lib/map-domain.ts");
} catch {
  // RED: the map domain boundary does not exist yet.
}

test("normalizes IDs and preserves the existing layer filtering rules", () => {
  const items = [
    { type: "point", id: " A-ID ", lat: 37.5, lng: 127 },
    { type: "point", id: "b-id", lat: 37.6, lng: 127.1 },
    { type: "cluster", id: "grid", count: 2, lat: 37.7, lng: 127.2 },
  ];
  const feedback = {
    "a-id": { seen: true, claimed: false },
    "b-id": { seen: false, claimed: true },
  };

  assert.equal(mapDomain.normalizeSightingId?.(" A-ID "), "a-id");
  assert.deepEqual(
    mapDomain.getFilteredItems?.(items, feedback, "default"),
    items
  );
  assert.deepEqual(mapDomain.getFilteredItems?.(items, feedback, "unseen"), [
    items[1],
  ]);
  assert.deepEqual(mapDomain.getFilteredItems?.(items, feedback, "bookmark"), [
    items[1],
  ]);
});

test("keeps the public zoom cap and established grid thresholds", () => {
  assert.equal(mapDomain.getGridSize?.(17, false), 0.01);
  assert.equal(mapDomain.getGridSize?.(17, true), 0.001);
  assert.equal(mapDomain.getGridSize?.(16, true), 0.003);
  assert.equal(mapDomain.getGridSize?.(15, true), 0.006);
  assert.equal(mapDomain.getGridSize?.(13, true), 0.03);
  assert.equal(mapDomain.getGridSize?.(10, true), 0.1);
  assert.equal(mapDomain.getGridSize?.(8, true), 0.5);
});

test("builds the same cache cell key and forces bookmark point zoom", () => {
  const viewport = {
    minLat: 37.51,
    minLng: 126.89,
    maxLat: 37.62,
    maxLng: 127.06,
  };

  assert.equal(
    mapDomain.buildMapCacheKey?.(viewport, 13, true, "default"),
    "true:default:1250,4229,1254,4235,13"
  );
  assert.equal(
    mapDomain.buildMapCacheKey?.(viewport, 13, true, "bookmark"),
    "true:bookmark:37510,126890,37620,127060,17"
  );
});

test("removes invalid path coordinates and interpolates by distance", () => {
  const coordinates = mapDomain.getBookmarkPathCoordinates?.({
    lost_post_id: "lost-1",
    lost_lat: 0,
    lost_lng: 0,
    lost_at: "2026-07-25T00:00:00.000Z",
    points: [
      {
        sighting_id: "bad",
        lat: Number.NaN,
        lng: 1,
        occurred_at: "2026-07-25T01:00:00.000Z",
      },
      {
        sighting_id: "one",
        lat: 3,
        lng: 0,
        occurred_at: "2026-07-25T02:00:00.000Z",
      },
      {
        sighting_id: "two",
        lat: 3,
        lng: 4,
        occurred_at: "2026-07-25T03:00:00.000Z",
      },
    ],
  });

  assert.deepEqual(coordinates, [
    { lat: 0, lng: 0 },
    { lat: 3, lng: 0 },
    { lat: 3, lng: 4 },
  ]);
  assert.deepEqual(mapDomain.interpolatePath?.(coordinates, 0.5), [
    { lat: 0, lng: 0 },
    { lat: 3, lng: 0 },
    { lat: 3, lng: 0.5 },
  ]);
  assert.deepEqual(mapDomain.interpolatePath?.(coordinates, 0), [
    { lat: 0, lng: 0 },
  ]);
  assert.deepEqual(mapDomain.interpolatePath?.(coordinates, 1), coordinates);
  assert.deepEqual(mapDomain.interpolatePath?.([], 0.5), []);
});

test("persists map layer preference in localStorage-compatible storage", () => {
  const memory = new Map();
  const storage = {
    getItem(key) {
      return memory.has(key) ? memory.get(key) : null;
    },
    setItem(key, value) {
      memory.set(key, String(value));
    },
  };

  assert.equal(mapDomain.readStoredMapLayer?.(storage), "default");
  mapDomain.writeStoredMapLayer?.("bookmark", storage);
  assert.equal(mapDomain.readStoredMapLayer?.(storage), "bookmark");
  storage.setItem(mapDomain.MAP_LAYER_STORAGE_KEY, "not-a-layer");
  assert.equal(mapDomain.readStoredMapLayer?.(storage), "default");
  assert.equal(mapDomain.isMapLayer?.("unseen"), true);
  assert.equal(mapDomain.isMapLayer?.("paths"), false);
});

test("guests cannot keep auth-only layers that would hide public clusters", () => {
  assert.equal(
    mapDomain.resolveMapLayerForSession?.("bookmark", false),
    "default"
  );
  assert.equal(
    mapDomain.resolveMapLayerForSession?.("unseen", false),
    "default"
  );
  assert.equal(
    mapDomain.resolveMapLayerForSession?.("default", false),
    "default"
  );
  assert.equal(
    mapDomain.resolveMapLayerForSession?.("bookmark", true),
    "bookmark"
  );
});
