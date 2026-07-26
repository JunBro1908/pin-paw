import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260726020000_allow_map_sighting_claims.sql";

test("claim RPC allows owned searching posts without recommendation_cache gate", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /claim_recommended_sighting/);
  assert.match(sql, /lp\.owner_id = auth\.uid\(\)/);
  assert.match(sql, /lp\.status = 'searching'/);
  assert.match(sql, /users_are_blocked/);
  assert.doesNotMatch(
    sql,
    /join public\.recommendation_cache|from public\.recommendation_cache/
  );
  assert.match(sql, /sighting_is_not_claimable/);
});

test("claim API no longer says only recommendation candidates can be bookmarked", async () => {
  const route = await readFile(
    "src/app/api/v1/me/lost-posts/[lostPostId]/sighting-claims/route.ts",
    "utf8"
  );

  assert.doesNotMatch(route, /현재 추천 후보만 북마크할 수 있습니다/);
  assert.match(route, /claim_recommended_sighting/);
});
