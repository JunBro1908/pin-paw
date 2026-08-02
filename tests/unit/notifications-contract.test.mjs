import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725120000_in_app_notifications.sql";

async function readMigration() {
  try {
    return await readFile(migrationPath, "utf8");
  } catch {
    return "";
  }
}

test("notifications and preferences are owner-bound with no browser table access", async () => {
  const sql = await readMigration();

  for (const table of ["notifications", "user_notification_preferences"]) {
    assert.match(
      sql,
      new RegExp(`alter table public\\.${table} enable row level security`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on table public\\.${table}[\\s\\S]*?from public,\\s*anon,\\s*authenticated`,
        "i"
      )
    );
  }

  for (const rpc of [
    "get_my_notifications",
    "mark_my_notification_read",
    "get_my_notification_preferences",
    "update_my_notification_preferences",
  ]) {
    assert.match(
      sql,
      new RegExp(
        `security definer[\\s\\S]*?${rpc}|${rpc}[\\s\\S]*?security definer`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${rpc}[\\s\\S]*?from public,\\s*anon,\\s*authenticated,\\s*service_role`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${rpc}[\\s\\S]*?to authenticated`,
        "i"
      )
    );
  }
});

test("payload is constrained to safe identifiers, timestamps, and display metadata", async () => {
  const sql = await readMigration();

  assert.match(sql, /notification_type/i);
  assert.match(sql, /lost_post_id uuid/i);
  assert.match(sql, /sighting_id uuid/i);
  assert.match(sql, /created_at timestamptz not null/i);
  assert.match(sql, /read_at timestamptz/i);
  assert.match(sql, /display_metadata jsonb not null default '\{\}'::jsonb/i);
  assert.match(
    sql,
    /display_metadata\s*-\s*array\['petName',\s*'status'\]::text\[\]\s*=\s*'\{\}'::jsonb/i
  );
  assert.doesNotMatch(
    sql,
    /display_metadata[\s\S]{0,300}'(?:lat|lng|location|note|token)'/i
  );
});

test("all event producers honor preferences and dedupe atomically", async () => {
  const sql = await readMigration();

  assert.match(sql, /unique index notifications_dedupe_key_idx/i);
  assert.match(sql, /on conflict \(dedupe_key\) do nothing/i);
  assert.match(sql, /after insert or update[\s\S]*recommendation_cache/i);
  assert.match(sql, /after insert or delete[\s\S]*lost_post_sighting_claims/i);
  assert.match(sql, /after update of status[\s\S]*lost_posts/i);
  assert.match(sql, /new_recommendation_enabled/i);
  assert.match(sql, /claim_updates_enabled/i);
  assert.match(sql, /lost_post_status_enabled/i);
  assert.doesNotMatch(sql, /exception[\s\S]*when others[\s\S]*return/i);
});

test("recommendation notify dedupe_key parenthesizes jsonb extraction", async () => {
  const sql = await readFile(
    "supabase/migrations/20260726010000_fix_recommendation_notify_dedupe_concat.sql",
    "utf8"
  );

  assert.match(sql, /\|\|\s*\(candidate\.value\s*->>\s*'sightingId'\)/);
  assert.doesNotMatch(sql, /\|\|\s*candidate\.value\s*->>\s*'sightingId'/);
});

test("anonymous sightings are skipped and status recipients require a claim relationship", async () => {
  const sql = await readMigration();

  assert.match(sql, /s\.user_id is not null/i);
  assert.match(
    sql,
    /lost_post_sighting_claims[\s\S]*join public\.sightings[\s\S]*status/i
  );
});

test("notification creation does not broaden precise-location authorization", async () => {
  const [sql, privacySql] = await Promise.all([
    readMigration(),
    readFile(
      "supabase/migrations/20260725050000_protect_precise_sighting_locations.sql",
      "utf8"
    ),
  ]);

  assert.doesNotMatch(
    sql,
    /create or replace function public\.get_authorized_sighting_(?:markers|detail)/i
  );
  assert.doesNotMatch(
    sql,
    /grant\s+(?:select|update|insert|delete)[\s\S]*public\.(?:sightings|lost_post_sighting_claims)/i
  );
  assert.match(
    privacySql,
    /s\.user_id = auth\.uid\(\)[\s\S]*recommendation_cache/i
  );
  assert.doesNotMatch(
    privacySql
      .split(
        "create or replace function public.get_authorized_sighting_detail"
      )[1]
      .split("create or replace function public.claim_recommended_sighting")[0],
    /lost_post_sighting_claims/i
  );
});

test("notification APIs cap pagination and use owner-only RPCs", async () => {
  const [listRoute, itemRoute, preferencesRoute] = await Promise.all([
    readFile("src/app/api/v1/me/notifications/route.ts", "utf8").catch(
      () => ""
    ),
    readFile(
      "src/app/api/v1/me/notifications/[notificationId]/route.ts",
      "utf8"
    ).catch(() => ""),
    readFile(
      "src/app/api/v1/me/notification-preferences/route.ts",
      "utf8"
    ).catch(() => ""),
  ]);

  assert.match(listRoute, /parsePagination\([\s\S]*20,\s*100/);
  assert.match(listRoute, /\.rpc\(\s*"get_my_notifications"/);
  assert.doesNotMatch(listRoute, /\.from\(\s*"notifications"\s*\)/);
  assert.match(itemRoute, /\.rpc\(\s*"mark_my_notification_read"/);
  assert.doesNotMatch(itemRoute, /\.from\(\s*"notifications"\s*\)/);
  assert.match(preferencesRoute, /\.rpc\(\s*"get_my_notification_preferences"/);
  assert.match(
    preferencesRoute,
    /\.rpc\(\s*"update_my_notification_preferences"/
  );
  assert.doesNotMatch(
    preferencesRoute,
    /\.from\(\s*"user_notification_preferences"\s*\)/
  );
});

test("recommendation cache write failures are logged without hiding results", async () => {
  const route = await readFile(
    "src/app/api/v1/recommendations/route.ts",
    "utf8"
  );

  assert.match(route, /recommendation\.cache_write_failed/);
  assert.match(
    route,
    /if \(cacheWriteError\) \{\s*logger\.error\("recommendation\.cache_write_failed"/
  );
  assert.doesNotMatch(
    route,
    /if \(cacheWriteError\) \{[\s\S]*?return fail\(\s*ApiErrorCode\.INTERNAL_ERROR,\s*"추천 결과 저장에 실패했습니다\."/
  );
  assert.match(
    route,
    /if \(cacheWriteError\) \{[\s\S]*?\}\s*const itemsWithFeedback = await applyFeedback\(result\);\s*return ok\(/
  );
});
