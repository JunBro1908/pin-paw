import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { toPublicRecommendationItem } from "../../src/features/recommendations/lib/recommendation-presentation.ts";
import { protectRecommendationLocations } from "../../src/shared/lib/privacy-location.ts";

const migrationUrl = new URL(
  "../../supabase/migrations/20260802020000_recommendation_evidence.sql",
  import.meta.url
);

async function readMigration() {
  return readFile(migrationUrl, "utf8");
}

test("recommendation RPC returns explainable evidence inputs", async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /st_distance\(s\.location::geography, v_lost_location\) \/ 1000\.0 as distance_km/i
  );
  assert.match(
    sql,
    /extract\(epoch from \(s\.occurred_at - v_lost_at\)\) \/ 3600\.0 as time_delta_hours/i
  );
  assert.match(
    sql,
    /array_remove\(array\[[\s\S]*?\], null\) as matched_traits/i
  );
  assert.match(sql, /'distanceKm',\s*round\(distance_km::numeric, 1\)/i);
  assert.match(
    sql,
    /'timeDeltaHours',\s*round\(time_delta_hours::numeric, 1\)/i
  );
  assert.match(sql, /'matchedTraits',\s*matched_traits/i);
});

test("recommendation candidates exclude archived and hidden sightings before ranking", async () => {
  const sql = await readMigration();
  const candidates = sql.match(
    /with candidates as \(([\s\S]*?)\),\s*color_inter as/i
  )?.[1];

  assert.ok(candidates, "candidates CTE must exist");
  assert.match(candidates, /s\.archived_at is null/i);
  assert.match(candidates, /s\.hidden_at is null/i);
});

test("recommendation evidence preserves the established ranking formula and limits", async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /case when use_species then 0\.2 \/ nullif\(total_w, 0\) else 0\.0 end \* sim_s\s*\+ 0\.45 \/ nullif\(total_w, 0\) \* sim_c\s*\+ case when use_size then 0\.1 \/ nullif\(total_w, 0\) else 0\.0 end \* sim_z\s*\+ tag_bonus\s*\+ sim_note\) as similarity/i
  );
  assert.match(sql, /order by similarity desc limit least\(p_top_k, 100\)/i);
  assert.match(
    sql,
    /st_dwithin\(s\.location::geography, v_lost_location, p_radius_km \* 1000\)/i
  );
  assert.match(sql, /s\.occurred_at >= v_lost_at/i);
  assert.match(
    sql,
    /s\.occurred_at <= v_lost_at \+ \(p_days \|\| ' days'\)::interval/i
  );
  assert.match(sql, /'similarity',\s*round\(similarity::numeric, 4\)/i);
  assert.match(sql, /'lat',\s*st_y\(location::geometry\)/i);
  assert.match(sql, /'lng',\s*st_x\(location::geometry\)/i);
  assert.match(
    sql,
    /jsonb_agg\([\s\S]*?order by similarity desc, sighting_id\s*\)/i
  );
});

test("recommendation RPC remains a safe service-role-only security definer", async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /get_recommendations_for_lost_post\(\s*p_lost_post_id uuid,\s*p_radius_km float default 8,\s*p_days float default 8,\s*p_top_k int default 10\s*\)/i
  );
  assert.match(
    sql,
    /language plpgsql\s+security definer\s+set search_path = pg_catalog, public, extensions/i
  );
  assert.match(
    sql,
    /revoke all on function public\.get_recommendations_for_lost_post\(\s*uuid,\s*double precision,\s*double precision,\s*integer\s*\) from public, anon, authenticated, service_role/i
  );
  assert.match(
    sql,
    /grant execute on function public\.get_recommendations_for_lost_post\(\s*uuid,\s*double precision,\s*double precision,\s*integer\s*\) to service_role/i
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.get_recommendations_for_lost_post[\s\S]*?to (?:anon|authenticated)\b/i
  );
});

test("public recommendation mapping omits raw evidence fields after masking location", () => {
  const [protectedItem] = protectRecommendationLocations([
    {
      sightingId: "8db61ddf-bce2-4b51-b531-0b93093053d1",
      similarity: 0.8,
      distanceKm: 1.4,
      timeDeltaHours: 0.4,
      matchedTraits: ["color"],
      photoKeys: ["safe/example.webp"],
      occurredAt: "2026-07-25T00:00:00.000Z",
      lat: 37.5665,
      lng: 126.978,
      claimedAsMyDog: true,
      internalModelScore: 0.991,
      preciseAddress: "서울시 내부 비공개 주소",
    },
  ]);

  const result = toPublicRecommendationItem(protectedItem);

  assert.deepEqual(result, {
    sightingId: "8db61ddf-bce2-4b51-b531-0b93093053d1",
    photoKeys: ["safe/example.webp"],
    occurredAt: "2026-07-25T00:00:00.000Z",
    lat: 37.575,
    lng: 126.975,
    locationPrecision: "approximate",
    claimedAsMyDog: true,
    priority: "high",
    matchPercent: 80,
    matchSummary: "색상 일치",
    distanceKm: 1.4,
    timeDeltaHours: 0.4,
    contextChips: ["1.4km 거리", "1시간 이내 목격"],
  });
  assert.equal("similarity" in result, false);
  assert.equal("matchedTraits" in result, false);
  assert.equal("evidence" in result, false);
  assert.equal("internalModelScore" in result, false);
  assert.equal("preciseAddress" in result, false);
});
