import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migration =
  "supabase/migrations/20260809010000_map_sighting_detail_trait_tags.sql";

test("authenticated map detail RPC returns trait tags without weakening its boundary", async () => {
  const sql = await readFile(migration, "utf8");

  assert.match(
    sql,
    /create or replace function public\.get_block_filtered_sighting_detail\(\s*p_sighting_id uuid\s*\)/i
  );
  assert.match(sql, /s\.trait_tags/i);
  assert.match(sql, /'trait_tags',\s*s\.trait_tags/i);
  assert.match(sql, /auth\.uid\(\) is not null/i);
  assert.match(sql, /users_are_blocked\(auth\.uid\(\), s\.user_id\)/i);
  assert.match(
    sql,
    /revoke all on function public\.get_block_filtered_sighting_detail\(uuid\)[\s\S]*from public, anon, authenticated, service_role;[\s\S]*grant execute on function public\.get_block_filtered_sighting_detail\(uuid\)[\s\S]*to authenticated;/i
  );
});
