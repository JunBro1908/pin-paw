import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("my sighting card shows occurred time, coarse region, and normalized size", async () => {
  const [card, route, types] = await Promise.all([
    readFile("src/features/sightings/components/MySightingCard.tsx", "utf8"),
    readFile("src/app/api/v1/me/sightings/route.ts", "utf8"),
    readFile("src/features/sightings/model/types.ts", "utf8"),
  ]);

  assert.match(card, /formatSeoulLostDateTime\(item\.occurred_at\)/);
  assert.match(card, /approximate_region/);
  assert.match(card, /formatDogSizeLabel/);
  assert.match(card, /grid-cols-\[6rem_minmax\(0,1fr\)_auto\]/);
  assert.match(card, /min-h-10 w-full items-center justify-center/);
  assert.doesNotMatch(card, /truncate/);
  assert.doesNotMatch(card, /SIZE_LABELS/);
  assert.match(route, /resolveApproxRegionLabel/);
  assert.match(route, /approximate_region/);
  assert.match(types, /approximate_region\?: string \| null/);
});
