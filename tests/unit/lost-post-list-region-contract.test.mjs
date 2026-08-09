import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

const routePath = "src/app/api/v1/lost-posts/route.ts";
const typesPath = "src/features/lost-posts/model/types.ts";

test("authenticated lost post list maps its existing location to an approximate region", async () => {
  const route = await readFile(routePath, "utf8");

  assert.match(route, /import\s*\{\s*resolveApproxRegionLabel\s*\}\s*from\s*["']@\/shared\/lib\/approx-region-label["']/);
  assert.match(route, /const list = await Promise\.all\([\s\S]*?extractPointCoordinates\(row\.lost_location\)[\s\S]*?resolveApproxRegionLabel\(point\.lat, point\.lng\)[\s\S]*?approximate_region[\s\S]*?\);/);
  assert.match(route, /return ok\(list, \{ limit, offset \}\);/);
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
