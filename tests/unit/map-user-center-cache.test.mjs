import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cache = await import(
  "../../src/features/map/lib/map-user-center-cache.ts"
);

test("user map center cache honors TTL and clears", () => {
  cache.clearCachedUserMapCenter();
  assert.equal(cache.getCachedUserMapCenter(), null);

  cache.setCachedUserMapCenter(37.5, 127.0);
  assert.deepEqual(cache.getCachedUserMapCenter(), { lat: 37.5, lng: 127.0 });

  const expiredAt = Date.now() + cache.USER_MAP_CENTER_TTL_MS + 1;
  assert.equal(cache.getCachedUserMapCenter(expiredAt), null);

  cache.setCachedUserMapCenter(37.6, 127.1);
  cache.clearCachedUserMapCenter();
  assert.equal(cache.getCachedUserMapCenter(), null);
});

test("NaverMap opens on warmed center and silent-follows once on miss", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  assert.match(source, /getCachedUserMapCenter/);
  assert.match(source, /setCachedUserMapCenter/);
  assert.match(source, /warmUserMapCenter/);
  assert.match(source, /silentFollowUserLocation/);
  assert.match(source, /userMovedMapRef/);
  assert.match(source, /warmedCenter \? 15 : DEFAULT_MAP_WARM_ZOOM/);
  assert.doesNotMatch(
    source,
    /if \(!initialCenter && !initialCenterSightingId\) \{\s*handleCurrentLocation\(\);/
  );
});

test("viewport warm helpers prefer cached user center over Seoul", async () => {
  const source = await readFile(
    "src/features/map/lib/map-viewport-cache.ts",
    "utf8"
  );

  assert.match(source, /getCachedUserMapCenter\(\) \?\? DEFAULT_MAP_CENTER/);
});
