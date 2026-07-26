import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725110000_operational_slo_snapshot.sql";
const endpointPath = "src/app/api/v1/internal/operations/snapshot/route.ts";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

test("migration exposes one service-role-only bounded snapshot RPC", async () => {
  const sql = await source(migrationPath);

  assert.match(
    sql,
    /create (?:or replace )?function public\.get_operational_snapshot/i
  );
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(
    sql,
    /revoke all on function public\.get_operational_snapshot\(\)[\s\S]*from public,\s*anon,\s*authenticated/i
  );
  assert.match(
    sql,
    /grant execute on function public\.get_operational_snapshot\(\)[\s\S]*to service_role/i
  );
  assert.doesNotMatch(
    sql.match(
      /create (?:or replace )?function public\.get_operational_snapshot\(\)[\s\S]*?\$\$;/i
    )?.[0] ?? "",
    /\b(user_id|owner_id|reporter_id|target_id|note|location|token|object_key)\b/i
  );
});

test("API observations use bounded low-cardinality dimensions", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create table public\.operational_api_rollups/i);
  assert.match(sql, /route_class[\s\S]*check/i);
  assert.match(sql, /method[\s\S]*check/i);
  assert.match(sql, /status_class[\s\S]*check/i);
  assert.match(sql, /duration_bucket_ms[\s\S]*check/i);
  assert.match(sql, /primary key\s*\([\s\S]*bucket_start/i);
  assert.doesNotMatch(sql, /\buser_id\b/i);
});

test("internal endpoint reuses CRON auth and returns only snapshot and alerts", async () => {
  const route = await source(endpointPath);

  assert.match(route, /createCronAuthorizedValue/);
  assert.match(route, /\.rpc\(\s*"get_operational_snapshot"/);
  assert.match(route, /parseOperationalSnapshot/);
  assert.match(route, /evaluateOperationalSnapshot/);
  assert.match(route, /snapshot,\s*alerts/);
  assert.doesNotMatch(route, /\b(userId|note|location|token)\b/);
});
