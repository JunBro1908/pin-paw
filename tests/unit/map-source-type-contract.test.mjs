import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const path = "supabase/migrations/20260802010000_map_source_types.sql";

test("map RPCs derive source type without exposing shelter mapping table", async () => {
  const sql = await readFile(path, "utf8");
  assert.match(
    sql,
    /create or replace function public\.get_sighting_clusters/i
  );
  assert.match(
    sql,
    /create or replace function public\.get_block_filtered_sighting_markers/i
  );
  assert.match(
    sql,
    /left join public\.shelter_animal_imports sai[\s\S]*sai\.sighting_id = s\.id/i
  );
  assert.match(
    sql,
    /case\s+when sai\.sighting_id is null then 'sighting'\s+else 'shelter'\s+end as source_type/i
  );
  assert.match(sql, /group by[\s\S]*source_type/i);
  assert.match(sql, /'source_type',\s*(?:source_type|op\.source_type)/i);
  assert.match(
    sql,
    /revoke all on table public\.shelter_animal_imports[\s\S]*from public, anon, authenticated/i
  );
});
