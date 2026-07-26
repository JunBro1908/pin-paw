import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725090000_reports_blocks_sla.sql";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

let parseReportRequest;
let parseBlockRequest;
let parseAdminReportUpdateRequest;
let parseReportStatus;
try {
  ({
    parseReportRequest,
    parseBlockRequest,
    parseAdminReportUpdateRequest,
    parseReportStatus,
  } = await import("../../src/shared/lib/api-input.ts"));
} catch {
  // RED: M1-05 input contracts are not implemented yet.
}

test("report input accepts known categories and bounded reasons only", () => {
  assert.deepEqual(
    parseReportRequest?.({
      category: "animal_abuse",
      reason: "  즉시 확인이 필요합니다.  ",
    }),
    {
      ok: true,
      value: {
        category: "animal_abuse",
        reason: "즉시 확인이 필요합니다.",
      },
    }
  );
  assert.equal(
    parseReportRequest?.({ category: "custom", reason: "x" }).ok,
    false
  );
  assert.equal(
    parseReportRequest?.({ category: "spam", reason: "x".repeat(1001) }).ok,
    false
  );
  assert.equal(
    parseReportRequest?.({ category: "spam", reason: "", extra: true }).ok,
    false
  );
});

test("block and admin report inputs reject coercion and unknown fields", () => {
  assert.deepEqual(parseBlockRequest?.({ blocked: true }), {
    ok: true,
    value: { blocked: true },
  });
  assert.equal(parseBlockRequest?.({ blocked: "true" }).ok, false);
  assert.equal(
    parseBlockRequest?.({ blocked: false, userId: "forged" }).ok,
    false
  );

  assert.deepEqual(
    parseAdminReportUpdateRequest?.({
      status: "resolved",
      reason: "조치 완료",
      hidden: true,
    }),
    {
      ok: true,
      value: { status: "resolved", reason: "조치 완료", hidden: true },
    }
  );
  assert.equal(
    parseAdminReportUpdateRequest?.({
      status: "closed",
      reason: "x",
    }).ok,
    false
  );
  assert.equal(parseReportStatus?.("reviewing").ok, true);
  assert.equal(parseReportStatus?.("all").ok, false);
});

test("reports have atomic active deduplication, ownership checks, and DB SLA", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create table public\.content_reports/i);
  assert.match(
    sql,
    /create unique index[\s\S]*reporter_id,\s*target_type,\s*target_id[\s\S]*where status in \('open',\s*'reviewing'\)/i
  );
  assert.match(sql, /create function public\.create_content_report/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /select true,\s*lp\.owner_id/i);
  assert.match(sql, /select true,\s*s\.user_id/i);
  assert.match(sql, /v_target_owner_id = v_reporter_id/i);
  assert.match(sql, /raise exception 'cannot_report_own_content'/i);
  assert.match(sql, /unique_violation/i);
  assert.match(
    sql,
    /case when public\.report_category_is_high\(p_category\)[\s\S]*interval '24 hours'[\s\S]*interval '72 hours'/i
  );
  assert.match(
    sql,
    /revoke all on table public\.content_reports[\s\S]*from public,\s*anon,\s*authenticated,\s*service_role/i
  );
});

test("block mutation derives the actor and shared visibility helpers filter reads", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create table public\.user_blocks/i);
  assert.match(sql, /check \(blocker_id <> blocked_id\)/i);
  assert.match(sql, /create function public\.set_user_block/i);
  assert.match(sql, /v_blocker_id uuid := auth\.uid\(\)/i);
  assert.match(sql, /raise exception 'cannot_block_self'/i);
  assert.match(
    sql,
    /revoke all on table public\.user_blocks[\s\S]*from public,\s*anon,\s*authenticated,\s*service_role/i
  );
  assert.match(sql, /create function public\.users_are_blocked/i);
  assert.match(sql, /create function public\.filter_blocked_sighting_ids/i);
  assert.match(
    sql,
    /not public\.users_are_blocked\(v_user_id,\s*s\.user_id\)/i
  );
  assert.match(
    sql,
    /revoke all on function public\.get_authorized_sighting_markers/i
  );
});

test("admin report workflows are app_metadata gated, audited, and may atomically hide", async () => {
  const sql = await source(migrationPath);
  const listRoute = await source("src/app/api/v1/admin/reports/route.ts");
  const updateRoute = await source(
    "src/app/api/v1/admin/reports/[reportId]/route.ts"
  );

  assert.match(sql, /create function public\.list_content_reports/i);
  assert.match(sql, /create function public\.update_content_report/i);
  assert.match(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'/i);
  assert.match(sql, /perform public\.moderate_content/i);
  assert.match(sql, /insert into public\.admin_audit_log/i);
  assert.match(sql, /'report\.status\.'\s*\|\|\s*p_status/i);
  assert.match(
    sql,
    /grant execute on function public\.list_content_reports[\s\S]*to authenticated/i
  );

  for (const route of [listRoute, updateRoute]) {
    assert.match(route, /hasAdminAppMetadata\(user\)/);
    assert.match(route, /createRequestLogger/);
    assert.doesNotMatch(route, /user_metadata/);
  }
  assert.match(listRoute, /parsePagination/);
  assert.match(listRoute, /parseReportStatus/);
  assert.match(updateRoute, /isValidUuid\(reportId\)/);
  assert.match(updateRoute, /readJsonBody\(request,\s*4096\)/);
  assert.match(updateRoute, /parseAdminReportUpdateRequest/);
});

test("member APIs use shared validation and authenticated RPC boundaries", async () => {
  const reportRoute = await source(
    "src/app/api/v1/reports/[targetType]/[targetId]/route.ts"
  );
  const blockRoute = await source(
    "src/app/api/v1/me/blocks/[blockedUserId]/route.ts"
  );
  const recommendations = await source(
    "src/app/api/v1/recommendations/route.ts"
  );
  const map = await source("src/app/api/v1/auth/map/markers/route.ts");
  const detail = await source(
    "src/app/api/v1/auth/sightings/[sightingId]/route.ts"
  );

  for (const route of [reportRoute, blockRoute]) {
    assert.match(route, /createRequestLogger/);
    assert.match(route, /readJsonBody\(request,\s*4096\)/);
    assert.match(route, /isValidUuid/);
  }
  assert.match(reportRoute, /parseReportRequest/);
  assert.match(reportRoute, /\.rpc\(\s*"create_content_report"/);
  assert.match(blockRoute, /parseBlockRequest/);
  assert.match(blockRoute, /\.rpc\(\s*"set_user_block"/);
  assert.match(recommendations, /\.rpc\(\s*"filter_blocked_sighting_ids"/);
  assert.match(map, /get_block_filtered_sighting_markers/);
  assert.match(detail, /get_block_filtered_sighting_detail/);
});
