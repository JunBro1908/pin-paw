import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routePath = "src/app/api/v1/lost-posts/route.ts";
const typesPath = "src/features/lost-posts/model/types.ts";

test("authenticated lost post list maps its existing location to an approximate region", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /import\s*\{\s*resolveApproxRegionLabel\s*\}\s*from\s*["']@\/shared\/lib\/approx-region-label["']/);
  assert.match(route, /extractPointCoordinates\(row\.lost_location\)/);
  assert.match(route, /maskShareCoordinate\(point\.lat\)/);
  assert.match(route, /resolveApproxRegionLabel\(\s*approximatePoint\.lat,\s*approximatePoint\.lng/);
  assert.match(route, /return ok\(list, \{ limit, offset \}\);/);
});

test("authenticated lost post list accepts PostGIS POINT text locations", async () => {
  const route = await readFile(routePath, "utf8");
  assert.match(route, /POINT\\s\*\\\(/);
  assert.match(route, /const lng = Number\(match\[1\]\);/);
  assert.match(route, /const lat = Number\(match\[2\]\);/);
});

test("authenticated lost post list bounds reverse-geocoding concurrency", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /const APPROXIMATE_REGION_LOOKUP_CONCURRENCY = 4;/);
  assert.match(route, /async function mapWithConcurrency/);
  assert.match(route, /const list = await mapWithConcurrency\(\s*rows \?\? \[\],\s*APPROXIMATE_REGION_LOOKUP_CONCURRENCY,/);
  assert.doesNotMatch(
    route,
    /const list = await Promise\.all\([\s\S]*?\(rows \?\? \[\]\)\.map/
  );
});

test("authenticated lost post list exposes only a coarse region label", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /const approximate_region = regionLookup \? await regionLookup : null;/);
  assert.doesNotMatch(route, /road(?:_name)?\s*:/i);
  assert.doesNotMatch(route, /building(?:_name)?\s*:/i);
  assert.doesNotMatch(route, /address(?:_name)?\s*:/i);
});

test("lost post model declares the optional coarse region label", async () => {
  const types = await readFile(typesPath, "utf8");

  assert.match(types, /approximate_region\?: string \| null;/);
});
