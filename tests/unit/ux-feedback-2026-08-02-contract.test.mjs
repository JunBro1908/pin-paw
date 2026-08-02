import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("paw icon is a filled symmetric mark and confirm tab uses it", async () => {
  const [icon, layout] = await Promise.all([
    readFile("src/shared/ui/Icon.tsx", "utf8"),
    readFile("src/app/(tabs)/layout.tsx", "utf8"),
  ]);

  assert.match(layout, /href: "\/recommend".*icon: "paw"/s);
  assert.match(icon, /case "paw":/);
  assert.match(icon, /cx="5\.35"/);
  assert.match(icon, /cx="18\.65"/);
  assert.match(icon, /cx="9\.35"/);
  assert.match(icon, /cx="14\.65"/);
  assert.match(icon, /rotate\(-34 5\.35 7\.55\)/);
  assert.match(icon, /rotate\(34 18\.65 7\.55\)/);
  assert.match(icon, /fill="currentColor"/);
  assert.match(icon, /Symmetric filled paw/);
});

test("default map layer renders own lost posts with sightings", async () => {
  const [map, data] = await Promise.all([
    readFile("src/features/map/components/NaverMap.tsx", "utf8"),
    readFile("src/features/map/hooks/use-map-data.ts", "utf8"),
  ]);

  assert.match(
    data,
    /layer === "bookmark" \|\| layer === "default" \? view\.lostPosts/
  );
  assert.match(
    map,
    /mapLayer === "bookmark" \|\| mapLayer === "default"/
  );
  assert.match(map, /mapLayer !== "bookmark" && mapLayer !== "default"/);
});

test("detail cards explain sighting and shelter sources", async () => {
  const card = await readFile(
    "src/features/sightings/components/SightingDetailCard.tsx",
    "utf8"
  );
  assert.match(card, /목격 제보/);
  assert.match(card, /보호소/);
  assert.match(card, /source_type === "shelter"/);
});
