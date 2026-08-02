import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth markers always emit owner pins separately from other clusters", async () => {
  const sql = await readFile(
    "supabase/migrations/20260726040000_auth_map_always_include_owner_pins.sql",
    "utf8"
  );

  assert.match(sql, /owner_points as/);
  assert.match(sql, /other_points as/);
  assert.match(sql, /where user_id = v_user_id/);
  assert.match(sql, /user_id is distinct from v_user_id/);
  assert.match(sql, /'location_precision',\s*'precise'/);
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
