import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("AuthProvider warms the default auth map viewport on login", async () => {
  const source = await readFile(
    "src/features/auth/context/AuthContext.tsx",
    "utf8"
  );

  assert.match(source, /prefetchAuthMapViewport/);
  assert.match(source, /clearMapViewportCache/);
  assert.match(
    source,
    /void prefetchAuthMapViewport\(accessToken\)/
  );
});

test("NaverMap hides guest list entry points that cannot show points", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  assert.match(source, /isAuthenticated && \(/);
  assert.match(source, /aria-label="제보 목록 보기"/);
  assert.match(
    source,
    /Guests only receive masked clusters — opening the point list is empty\/noise/
  );
  assert.match(source, /if \(isAuthenticated\) \{\s*setIsListViewOpen\(true\)/);
  assert.match(source, /\{isAuthenticated && isListViewOpen && \(/);
});

test("useMapData reads and writes the shared viewport cache", async () => {
  const source = await readFile(
    "src/features/map/hooks/use-map-data.ts",
    "utf8"
  );

  assert.match(source, /getMapViewportCache/);
  assert.match(source, /setMapViewportCache/);
  assert.doesNotMatch(source, /cacheRef\.current/);
});
