import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725050000_protect_precise_sighting_locations.sql";
const authMapPinsMigrationPath =
  "supabase/migrations/20260726000000_auth_map_precise_pins.sql";

test("authenticated map and detail reads use auth-bound privacy RPCs", async () => {
  const [mapRoute, detailRoute] = await Promise.all([
    readFile("src/app/api/v1/auth/map/markers/route.ts", "utf8"),
    readFile("src/app/api/v1/auth/sightings/[sightingId]/route.ts", "utf8"),
  ]);

  assert.match(
    mapRoute,
    /supabaseAuth\.rpc\(\s*"get_block_filtered_sighting_markers"/
  );
  assert.doesNotMatch(mapRoute, /is_public:\s*false/);
  assert.doesNotMatch(mapRoute, /\.rpc\(\s*"get_sighting_clusters"/);

  assert.match(
    detailRoute,
    /supabaseAuth\.rpc\(\s*"get_block_filtered_sighting_detail"/
  );
  assert.doesNotMatch(detailRoute, /\.from\(\s*"sightings"\s*\)/);
  assert.doesNotMatch(detailRoute, /createServiceRoleSupabase/);
});

test("auth map markers unlock precise points on zoom without public zoom cap", async () => {
  const sql = await readFile(authMapPinsMigrationPath, "utf8");

  assert.match(sql, /get_block_filtered_sighting_markers/);
  assert.match(sql, /p_zoom_level\s*>=\s*17/);
  assert.doesNotMatch(sql, /least\(\s*p_zoom_level\s*,\s*11\s*\)/);
  assert.match(sql, /'type',\s*'point'/);
  assert.match(sql, /'location_precision',\s*'precise'/);
  assert.match(sql, /users_are_blocked/);
  assert.match(sql, /grant\s+execute[\s\S]*get_block_filtered_sighting_markers[\s\S]*\bto\s+authenticated\b/i);
  assert.doesNotMatch(
    sql,
    /grant\s+execute[\s\S]*get_block_filtered_sighting_markers[\s\S]*\bto\s+anon\b/i
  );
});

test("auth sighting detail returns precise fields for any non-blocked member", async () => {
  const sql = await readFile(authMapPinsMigrationPath, "utf8");
  const detailFunction = sql.split(
    "create or replace function public.get_block_filtered_sighting_detail"
  )[1];

  assert.match(detailFunction, /'location_precision',\s*'precise'/);
  assert.match(detailFunction, /st_y\(s\.location::geometry\)/);
  assert.match(detailFunction, /st_x\(s\.location::geometry\)/);
  assert.match(detailFunction, /'note',\s*s\.note/);
  assert.doesNotMatch(
    detailFunction,
    /case\s+when\s+s\.user_id\s*=\s*auth\.uid\(\)\s+then\s+s\.note/i
  );
  assert.doesNotMatch(detailFunction, /recommendation_cache/i);
});

test("recommendations mask coordinates before returning cached or fresh data", async () => {
  const source = await readFile(
    "src/app/api/v1/recommendations/route.ts",
    "utf8"
  );

  assert.match(source, /protectRecommendationLocations/);
  assert.match(source, /locationPrecision/);
  assert.match(source, /\.eq\(\s*"owner_id",\s*user\.id\s*\)/);
});

test("claim mutations use authenticated RPCs rather than direct table writes", async () => {
  const [collectionRoute, itemRoute, globalRoute] = await Promise.all([
    readFile(
      "src/app/api/v1/me/lost-posts/[lostPostId]/sighting-claims/route.ts",
      "utf8"
    ),
    readFile(
      "src/app/api/v1/me/lost-posts/[lostPostId]/sighting-claims/[sightingId]/route.ts",
      "utf8"
    ),
    readFile("src/app/api/v1/me/sighting-claims/route.ts", "utf8"),
  ]);

  assert.match(collectionRoute, /\.rpc\(\s*"claim_recommended_sighting"/);
  assert.doesNotMatch(
    collectionRoute,
    /\.from\(\s*"lost_post_sighting_claims"\s*\)\.upsert/
  );
  assert.match(itemRoute, /\.rpc\(\s*"unclaim_sighting"/);
  assert.doesNotMatch(
    itemRoute,
    /\.from\(\s*"lost_post_sighting_claims"\s*\)\s*\.delete/
  );
  assert.match(globalRoute, /\.rpc\(\s*"unclaim_sighting_from_all_my_posts"/);
  assert.doesNotMatch(
    globalRoute,
    /\.from\(\s*"lost_post_sighting_claims"\s*\)\s*\.delete\(/
  );
});

test("migration keeps precise data behind auth.uid and removes direct claim writes", async () => {
  const sql = await readFile(migrationPath, "utf8");
  const markerFunction = sql.split(
    "create or replace function public.get_authorized_sighting_detail"
  )[0];
  const detailFunction = sql
    .split(
      "create or replace function public.get_authorized_sighting_detail"
    )[1]
    .split("create or replace function public.claim_recommended_sighting")[0];
  const pathFunction = sql
    .split("create or replace function public.get_my_lost_post_paths")[1]
    .split("revoke insert, delete")[0];

  assert.match(sql, /get_authorized_sighting_markers/);
  assert.match(sql, /get_authorized_sighting_detail/);
  assert.match(sql, /claim_recommended_sighting/);
  assert.match(sql, /unclaim_sighting/);
  assert.match(sql, /unclaim_sighting_from_all_my_posts/);
  assert.match(sql, /auth\.uid\(\)/);
  assert.match(
    markerFunction,
    /p_min_lat\s+is\s+null[\s\S]*p_zoom_level\s+is\s+null/i
  );
  assert.match(
    sql,
    /revoke\s+create\s+on\s+schema\s+public\s+from\s+public,\s*anon,\s*authenticated/is
  );
  assert.match(
    sql,
    /revoke\s+insert,\s*delete\s+on\s+table\s+public\.lost_post_sighting_claims\s+from\s+authenticated/is
  );
  assert.match(
    sql,
    /grant\s+execute\s+on\s+function\s+public\.get_authorized_sighting_markers/is
  );
  assert.doesNotMatch(
    sql,
    /grant\s+execute[\s\S]*get_authorized_sighting_(?:markers|detail)[\s\S]*\bto\s+anon\b/i
  );
  assert.doesNotMatch(markerFunction, /lost_post_sighting_claims/i);
  assert.doesNotMatch(detailFunction, /lost_post_sighting_claims/i);
  assert.doesNotMatch(pathFunction, /'note'/i);
});

test("authorization ignores stale caches, closed lost posts, and archived sightings", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(sql, /rc\.expires_at\s*>\s*clock_timestamp\(\)/i);
  assert.match(sql, /lp\.status\s*=\s*'searching'/i);
  assert.match(sql, /lp\.archived_at\s+is\s+null/i);
  assert.match(sql, /s\.archived_at\s+is\s+null/i);
});
