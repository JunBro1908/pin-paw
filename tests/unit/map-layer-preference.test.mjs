import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth markers always emit owner pins separately from other clusters", async () => {
  const [legacy, next] = await Promise.all([
    readFile(
      "supabase/migrations/20260726040000_auth_map_always_include_owner_pins.sql",
      "utf8"
    ),
    readFile(
      "supabase/migrations/20260802020000_auth_map_privileged_pins_out_of_clusters.sql",
      "utf8"
    ),
  ]);

  assert.match(legacy, /owner_points as/);
  assert.match(legacy, /other_points as/);
  assert.match(legacy, /where user_id = v_user_id/);
  assert.match(legacy, /user_id is distinct from v_user_id/);
  assert.match(legacy, /'location_precision',\s*'precise'/);

  assert.match(next, /privileged_points as/);
  assert.match(next, /claimed_ids as/);
  assert.match(next, /lost_post_sighting_claims/);
  assert.match(next, /p_zoom_level >= 15/);
  assert.match(next, /v_grid_size := 0\.001/);
  assert.match(
    next,
    /Owner pins \+ bookmark endpoints stay out of ordinary clusters/
  );
});

test("NaverMap restores and writes map layer preference", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  assert.match(source, /readStoredMapLayer/);
  assert.match(source, /writeStoredMapLayer/);
  assert.match(source, /resolveMapLayerForSession/);
  assert.match(
    source,
    /useState<MapLayer>\(\s*\(\)\s*=>\s*readStoredMapLayer\(\)\s*\)/
  );
});

test("NaverMap refetches bookmark layer after claim mutations succeed", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  assert.match(
    source,
    /Refetch after mutation succeeds so paths\/markers match DB/
  );
  assert.match(
    source,
    /Always refetch after success — layer switch effect can race before POST/
  );
  assert.doesNotMatch(
    source,
    /setToast\(\{[\s\S]*북마크를 해제했습니다\.[\s\S]*if \(mapLayer === "bookmark"\) \{\s*void fetchBookmarkLayerData\(\);\s*\}\s*try \{/
  );
});
