import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725080000_admin_moderation_audit.sql";
const routePath =
  "src/app/api/v1/admin/moderation/[targetType]/[targetId]/route.ts";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

let hasAdminAppMetadata;
let parseModerationRequest;
try {
  ({ hasAdminAppMetadata } =
    await import("../../src/shared/lib/admin-authorization.ts"));
  ({ parseModerationRequest } =
    await import("../../src/shared/lib/api-input.ts"));
} catch {
  // RED: moderation authorization and input contracts are not implemented yet.
}

test("admin authorization trusts only explicit app_metadata claims", () => {
  assert.equal(
    hasAdminAppMetadata?.({
      app_metadata: { role: "admin" },
      user_metadata: { role: "member" },
    }),
    true
  );
  assert.equal(hasAdminAppMetadata?.({ app_metadata: { admin: true } }), true);
  assert.equal(
    hasAdminAppMetadata?.({
      app_metadata: {},
      user_metadata: { role: "admin", admin: true },
    }),
    false
  );
  assert.equal(
    hasAdminAppMetadata?.({ app_metadata: { role: "member", admin: "true" } }),
    false
  );
});

test("moderation input accepts only a boolean state and bounded reason", () => {
  assert.deepEqual(
    parseModerationRequest?.({ hidden: true, reason: "  개인정보 노출  " }),
    { ok: true, value: { hidden: true, reason: "개인정보 노출" } }
  );
  assert.equal(
    parseModerationRequest?.({ hidden: "true", reason: "x" }).ok,
    false
  );
  assert.equal(
    parseModerationRequest?.({ hidden: true, reason: "" }).ok,
    false
  );
  assert.equal(
    parseModerationRequest?.({ hidden: false, reason: "x".repeat(501) }).ok,
    false
  );
});

test("migration creates an append-only audit boundary and atomic moderation RPC", async () => {
  const sql = await source(migrationPath);

  assert.match(
    sql,
    /alter table public\.lost_posts\s+add column if not exists hidden_at/i
  );
  assert.match(
    sql,
    /alter table public\.sightings\s+add column if not exists hidden_at/i
  );
  assert.match(sql, /create table public\.admin_audit_log/i);
  for (const column of [
    "actor_id uuid not null",
    "action text not null",
    "target_type text not null",
    "target_id uuid not null",
    "reason text not null",
    "created_at timestamptz not null",
  ]) {
    assert.match(sql, new RegExp(column, "i"));
  }
  assert.match(sql, /char_length\(reason\) between 1 and 500/i);
  assert.match(sql, /before update or delete on public\.admin_audit_log/i);
  assert.match(sql, /raise exception 'admin_audit_log_is_append_only'/i);
  assert.match(
    sql,
    /alter table public\.admin_audit_log enable row level security/i
  );
  assert.match(
    sql,
    /revoke all on table public\.admin_audit_log\s+from public,\s*anon,\s*authenticated,\s*service_role/i
  );

  assert.match(sql, /create function public\.moderate_content/i);
  assert.match(sql, /security definer/i);
  assert.match(sql, /set search_path = pg_catalog, public/i);
  assert.match(sql, /auth\.jwt\(\)\s*->\s*'app_metadata'/i);
  assert.match(sql, /insert into public\.admin_audit_log/i);
  assert.match(
    sql,
    /revoke all on function public\.moderate_content[\s\S]*from public,\s*anon,\s*authenticated,\s*service_role/i
  );
  assert.match(
    sql,
    /grant execute on function public\.moderate_content[\s\S]*to authenticated/i
  );
});

test("moderation route hides authorization details and uses bounded shared input", async () => {
  const route = await source(routePath);

  assert.match(route, /hasAdminAppMetadata\(user\)/);
  assert.match(route, /ApiErrorCode\.NOT_FOUND[\s\S]*404/);
  assert.match(route, /isValidUuid\(targetId\)/);
  assert.match(route, /readJsonBody\(request,\s*4096\)/);
  assert.match(route, /parseModerationRequest/);
  assert.match(route, /\.rpc\("moderate_content"/);
  assert.match(route, /createRequestLogger/);
  assert.doesNotMatch(route, /user_metadata/);
  assert.doesNotMatch(route, /\.delete\(\)/);
});
