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
    /from public\.shelter_animal_imports[\s\S]*sai[\s\S]*sai\.sighting_id = s\.id/i
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

test("both map RPCs deduplicate shelter mappings before counting sightings", async () => {
  const sql = await readFile(path, "utf8");
  const deduplicatedJoins = sql.match(
    /left join\s*\(\s*select distinct sighting_id\s+from public\.shelter_animal_imports\s*\) sai\s+on sai\.sighting_id = s\.id/gi
  );

  assert.equal(deduplicatedJoins?.length, 2);
});

test("bookmark paths and authenticated detail derive source without duplicating rows", async () => {
  const sql = await readFile(path, "utf8");
  const pathFunction = sql
    .split("create or replace function public.get_my_lost_post_paths")[1]
    ?.split("revoke all on function public.get_my_lost_post_paths")[0];
  const detailFunction = sql
    .split(
      "create or replace function public.get_block_filtered_sighting_detail"
    )[1]
    ?.split(
      "revoke all on function public.get_block_filtered_sighting_detail"
    )[0];

  assert.ok(pathFunction);
  assert.ok(detailFunction);
  for (const fn of [pathFunction, detailFunction]) {
    assert.match(
      fn,
      /case\s+when exists\s*\([\s\S]*from public\.shelter_animal_imports sai[\s\S]*sai\.sighting_id = s\.id[\s\S]*\)\s+then 'shelter'\s+else 'sighting'\s+end/i
    );
    assert.match(fn, /'source_type',\s*source_type/i);
  }
});

test("source-aware path recreation preserves owner-only precise trail rules", async () => {
  const sql = await readFile(path, "utf8");
  const pathFunction = sql
    .split("create or replace function public.get_my_lost_post_paths")[1]
    ?.split("revoke all on function public.get_my_lost_post_paths")[0];

  assert.ok(pathFunction);
  assert.match(pathFunction, /lp\.owner_id = auth\.uid\(\)/i);
  assert.match(pathFunction, /lp\.archived_at is null/i);
  assert.match(pathFunction, /lp\.hidden_at is null/i);
  assert.match(pathFunction, /s\.archived_at is null/i);
  assert.match(pathFunction, /s\.hidden_at is null/i);
  assert.match(pathFunction, /users_are_blocked\(auth\.uid\(\), s\.user_id\)/i);
  assert.match(pathFunction, /st_y\(s\.location::geometry\) as lat/i);
  assert.match(pathFunction, /st_x\(s\.location::geometry\) as lng/i);
  assert.match(pathFunction, /'location_precision',\s*'precise'/i);
  assert.match(
    sql,
    /revoke all on function public\.get_my_lost_post_paths\(\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.get_my_lost_post_paths\(\)[\s\S]*to authenticated;/i
  );
});

test("source-aware detail recreation preserves authenticated precise non-blocked reads", async () => {
  const sql = await readFile(path, "utf8");
  const detailFunction = sql
    .split(
      "create or replace function public.get_block_filtered_sighting_detail"
    )[1]
    ?.split(
      "revoke all on function public.get_block_filtered_sighting_detail"
    )[0];

  assert.ok(detailFunction);
  assert.match(detailFunction, /auth\.uid\(\) is not null/i);
  assert.match(detailFunction, /s\.id = p_sighting_id/i);
  assert.match(detailFunction, /s\.archived_at is null/i);
  assert.match(detailFunction, /s\.hidden_at is null/i);
  assert.match(detailFunction, /s\.location is not null/i);
  assert.match(
    detailFunction,
    /users_are_blocked\(auth\.uid\(\), s\.user_id\)/i
  );
  assert.match(detailFunction, /'note',\s*s\.note/i);
  assert.match(detailFunction, /'lat',\s*st_y\(s\.location::geometry\)/i);
  assert.match(detailFunction, /'lng',\s*st_x\(s\.location::geometry\)/i);
  assert.match(detailFunction, /'location_precision',\s*'precise'/i);
  assert.doesNotMatch(detailFunction, /recommendation_cache/i);
  assert.match(
    sql,
    /revoke all on function public\.get_block_filtered_sighting_detail\(uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.get_block_filtered_sighting_detail\(uuid\)[\s\S]*to authenticated;/i
  );
});
