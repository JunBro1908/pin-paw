import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260725010000_lock_down_data_plane.sql",
  import.meta.url
);
const privacyMigrationUrl = new URL(
  "../../supabase/migrations/20260725050000_protect_precise_sighting_locations.sql",
  import.meta.url
);

async function readMigration() {
  try {
    return await readFile(migrationUrl, "utf8");
  } catch {
    return "";
  }
}

async function readPrivacyMigration() {
  try {
    return await readFile(privacyMigrationUrl, "utf8");
  } catch {
    return "";
  }
}

test("enables RLS and removes browser access to operational tables", async () => {
  const sql = await readMigration();

  for (const table of ["users", "embeddings", "idempotency_keys"]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i")
    );
  }

  assert.match(
    sql,
    /revoke all on table public\.users,\s*public\.embeddings,\s*public\.idempotency_keys,\s*public\.recommendation_cache[\s\S]*from anon,\s*authenticated/i
  );
});

test("blocks direct browser inserts and updates to sightings", async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /drop policy if exists "sightings_public_insert" on public\.sightings/i
  );
  assert.match(
    sql,
    /revoke insert,\s*update on table public\.sightings from anon,\s*authenticated/i
  );
  assert.match(
    sql,
    /grant select,\s*delete on table public\.sightings to authenticated/i
  );
});

test("keeps public map and recommendation RPCs service-role only", async () => {
  const sql = await readMigration();

  for (const name of [
    "get_sighting_clusters",
    "get_recommendations_for_lost_post",
    "get_sighting_detail",
    "archive_old_records_28d",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${name}[\\s\\S]*?to service_role`,
        "i"
      )
    );
  }
});

test("grants owner-scoped RPCs only to authenticated users", async () => {
  const sql = await readMigration();

  for (const name of [
    "get_my_sighting_center",
    "get_my_sightings_list",
    "get_my_lost_posts_with_location",
    "get_my_lost_post_paths",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${name}[\\s\\S]*?to authenticated`,
        "i"
      )
    );
  }
});

test("pins security-definer lookup paths ahead of writable schemas", async () => {
  const sql = await readMigration();

  for (const name of [
    "archive_old_records_28d",
    "get_recommendations_for_lost_post",
    "get_sighting_detail",
    "get_my_sighting_center",
    "get_my_sightings_list",
    "get_my_lost_posts_with_location",
    "get_my_lost_post_paths",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `alter function public\\.${name}[\\s\\S]*?set search_path = pg_catalog, public, extensions`,
        "i"
      )
    );
  }
});

test("privacy RPCs are authenticated-only and direct claim writes stay closed", async () => {
  const sql = await readPrivacyMigration();

  assert.match(
    sql,
    /revoke insert,\s*delete on table public\.lost_post_sighting_claims\s+from authenticated/i
  );

  for (const name of [
    "get_authorized_sighting_markers",
    "get_authorized_sighting_detail",
    "claim_recommended_sighting",
    "unclaim_sighting",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${name}[\\s\\S]*?to authenticated`,
        "i"
      )
    );
  }

  assert.doesNotMatch(
    sql,
    /grant execute on function public\.(?:get_authorized_sighting|claim_recommended|unclaim)[\s\S]*?\bto anon\b/i
  );
});
