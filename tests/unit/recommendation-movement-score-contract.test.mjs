import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260808020000_recommendation_movement_and_explanations.sql",
  import.meta.url
);

test("movement score expands its radius over time but penalizes distant sightings", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(
    sql,
    /least\(p_radius_km, 0\.45 \+ 0\.65 \* sqrt\(greatest\(c\.time_delta_hours, 0\) \+ 1\)\) as movement_radius_km/i
  );
  assert.match(
    sql,
    /exp\(-0\.5 \* power\(r\.distance_km \/ greatest\(r\.movement_radius_km \/ 2\.0, 0\.25\), 2\)\) as movement_score/i
  );
  assert.match(
    sql,
    /st_dwithin\(s\.location::geography, v_lost_location, p_radius_km \* 1000\)/i
  );
});

test("final score exposes the same five contributions rendered by the card", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /0\.40 \* s\.movement_score/i);
  assert.match(sql, /0\.15 \* s\.species_score/i);
  assert.match(sql, /0\.10 \* s\.size_score/i);
  assert.match(
    sql,
    /0\.25 \* \(0\.70 \* s\.color_semantic_score \+ 0\.30 \* s\.color_token_score\)/i
  );
  assert.match(sql, /0\.10 \* s\.distinctive_trait_score/i);
  assert.match(sql, /'scoreBreakdown', jsonb_build_object/i);
  assert.match(sql, /'movementRadiusKm'/i);
});

test("color prompt rollout requeues only colored embeddings and invalidates old leases", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /from public\.lost_posts lp/i);
  assert.match(sql, /from public\.sightings s/i);
  assert.match(sql, /nullif\(btrim\(lp\.trait_color\), ''\) is not null/i);
  assert.match(sql, /nullif\(btrim\(s\.trait_color\), ''\) is not null/i);
  assert.match(sql, /lease_token = null/i);
  assert.match(sql, /lease_expires_at = null/i);
  assert.match(
    sql,
    /delete from public\.recommendation_cache[\s\S]*?movement-v3_/i
  );
});
