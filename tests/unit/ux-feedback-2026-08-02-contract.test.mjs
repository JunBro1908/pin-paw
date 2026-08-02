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
  const [map, data, renderer] = await Promise.all([
    readFile("src/features/map/components/NaverMap.tsx", "utf8"),
    readFile("src/features/map/hooks/use-map-data.ts", "utf8"),
    readFile("src/features/map/lib/map-layer-renderer.ts", "utf8"),
  ]);

  assert.match(
    data,
    /layer === "bookmark" \|\| layer === "default" \? view\.lostPosts/
  );
  assert.match(data, /paths: layer === "bookmark" \? view\.paths/);
  assert.doesNotMatch(
    data,
    /layer === "bookmark" \|\| layer === "default" \? view\.paths/
  );
  assert.match(
    map,
    /mapLayer === "bookmark" \|\| mapLayer === "default"/
  );
  assert.match(map, /enabled: mapLayer === "bookmark"/);
  assert.doesNotMatch(
    map,
    /enabled: mapLayer === "bookmark" \|\| mapLayer === "default"/
  );
  assert.match(map, /mapLayer !== "bookmark" && mapLayer !== "default"/);
  assert.match(renderer, /zIndex: 200/);
  assert.match(
    renderer,
    /Above ordinary sighting clusters so ALL keeps owner lost pins visible/
  );
});

test("bookmark trails animate only on the bookmark layer", async () => {
  const renderer = await readFile(
    "src/features/map/lib/map-layer-renderer.ts",
    "utf8"
  );
  assert.match(renderer, /PATH_TRAIL_STATIC = "#86EFAC"/);
  assert.match(renderer, /PATH_TRAIL_ANIMATION = "#087A3E"/);
  assert.doesNotMatch(renderer, /#FDE68A|#EAB308/);
});

test("detail cards explain sighting and shelter sources via info tip", async () => {
  const card = await readFile(
    "src/features/sightings/components/SightingDetailCard.tsx",
    "utf8"
  );
  assert.match(card, /비회원 제보/);
  assert.match(card, /회원 제보/);
  assert.match(card, /나의 제보/);
  assert.match(card, /보호소/);
  assert.match(card, /SourceInfoTip/);
  assert.match(card, /role="tooltip"/);
  assert.match(card, /source_type === "shelter"/);
  assert.doesNotMatch(card, /사용자가 현장에서 올린 목격 기록입니다/);
});
