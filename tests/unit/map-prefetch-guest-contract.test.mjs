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
  assert.match(source, /void prefetchAuthMapViewport\(accessToken\)/);
});

test("NaverMap hides guest list entry points that cannot show points", async () => {
  const [source, toolbar] = await Promise.all([
    readFile("src/features/map/components/NaverMap.tsx", "utf8"),
    readFile("src/features/map/components/MapToolbar.tsx", "utf8"),
  ]);

  assert.match(source, /authenticated=\{isAuthenticated\}/);
  assert.match(source, /\{isAuthenticated && isListViewOpen && \(/);
  assert.match(
    source,
    /Guests only receive masked clusters — opening the point list is empty\/noise/
  );
  assert.match(source, /if \(isAuthenticated\) \{\s*setIsListViewOpen\(true\)/);
  assert.match(
    toolbar,
    /\{authenticated && \(\s*<div[\s\S]*?aria-label="지도 표시 범위"/
  );
  assert.match(
    toolbar,
    /\{authenticated && \(\s*<button[\s\S]*?aria-label="제보 목록 보기"/
  );
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
