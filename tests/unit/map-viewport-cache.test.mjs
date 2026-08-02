import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mapDomain = await import("../../src/features/map/lib/map-domain.ts");

test("default auth warm viewport snaps to a stable cache key", () => {
  const half = mapDomain.DEFAULT_MAP_WARM_HALF_SPAN;
  const { lat, lng } = mapDomain.DEFAULT_MAP_CENTER;
  const viewport = {
    minLat: lat - half,
    minLng: lng - half,
    maxLat: lat + half,
    maxLng: lng + half,
  };
  const key = mapDomain.buildMapCacheKey(
    viewport,
    mapDomain.DEFAULT_MAP_WARM_ZOOM,
    true,
    "default"
  );
  assert.equal(typeof key, "string");
  assert.match(key, /^true:default:/);
  assert.equal(
    mapDomain.buildMapCacheKey(
      viewport,
      mapDomain.DEFAULT_MAP_WARM_ZOOM,
      true,
      "default"
    ),
    key
  );
});

test("map viewport cache module exposes shared warm helpers", async () => {
  const source = await readFile(
    "src/features/map/lib/map-viewport-cache.ts",
    "utf8"
  );

  assert.match(source, /export function getMapViewportCache/);
  assert.match(source, /export function setMapViewportCache/);
  assert.match(source, /export function clearMapViewportCache/);
  assert.match(source, /export function prefetchAuthMapViewport/);
  assert.match(source, /If-None-Match/);
  assert.match(source, /\/api\/v1\/auth\/map\/markers/);
  assert.match(source, /getDefaultAuthMapCacheKey/);
});
