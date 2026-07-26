import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("owner lost-post paths restore precise trail coordinates", async () => {
  const sql = await readFile(
    "supabase/migrations/20260726030000_restore_owner_path_precision.sql",
    "utf8"
  );

  assert.match(sql, /get_my_lost_post_paths/);
  assert.match(sql, /st_y\(s\.location::geometry\) as lat/);
  assert.match(sql, /st_x\(s\.location::geometry\) as lng/);
  assert.match(sql, /'location_precision',\s*'precise'/);
  assert.doesNotMatch(sql, /floor\(st_y\(s\.location::geometry\)\s*\/\s*0\.05\)/);
  assert.match(sql, /grant execute[\s\S]*get_my_lost_post_paths[\s\S]*to authenticated/i);
});

test("detail sheet and card constrain desktop width", async () => {
  const [sheet, card] = await Promise.all([
    readFile("src/features/sightings/components/SightingDetailSheet.tsx", "utf8"),
    readFile("src/features/sightings/components/SightingDetailCard.tsx", "utf8"),
  ]);

  assert.match(sheet, /max-w-md/);
  assert.match(card, /max-w-md/);
  assert.match(card, /max-h-56|sm:max-h-64/);
});
