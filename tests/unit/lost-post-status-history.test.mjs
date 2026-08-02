import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725070000_lost_post_status_history.sql";

test("status history records the actor and every changed state", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /create table if not exists public\.lost_post_status_history/i
  );
  assert.match(sql, /from_status public\.lost_status/i);
  assert.match(sql, /to_status public\.lost_status not null/i);
  assert.match(sql, /changed_by uuid null references auth\.users/i);
  assert.match(
    sql,
    /values \(new\.id, old\.status, new\.status, auth\.uid\(\)\)/i
  );
  assert.match(sql, /after update of status on public\.lost_posts/i);
});

test("state machine keeps closed terminal and permits a mistaken found reopening", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /old\.status = 'searching' and new\.status in \('found', 'closed'\)/i
  );
  assert.match(
    sql,
    /old\.status = 'found' and new\.status in \('searching', 'closed'\)/i
  );
  assert.doesNotMatch(sql, /old\.status = 'closed' and new\.status/i);
  assert.match(sql, /errcode = '23514'/i);
});

test("only the lost-post owner can read history and browser roles cannot write it", async () => {
  const sql = await readFile(migrationPath, "utf8");

  assert.match(
    sql,
    /alter table public\.lost_post_status_history enable row level security/i
  );
  assert.match(sql, /lp\.owner_id = auth\.uid\(\)/i);
  assert.match(
    sql,
    /revoke all on table public\.lost_post_status_history[\s\S]*from public,\s*anon,\s*authenticated/i
  );
  assert.match(
    sql,
    /grant select on table public\.lost_post_status_history[\s\S]*to authenticated/i
  );
});

test("history API validates ownership, pagination, and returns no actor identifier", async () => {
  const route = await readFile(
    "src/app/api/v1/me/lost-posts/[lostPostId]/status-history/route.ts",
    "utf8"
  );

  assert.match(route, /isValidUuid\(lostPostId\)/);
  assert.match(route, /parsePagination\(/);
  assert.match(route, /\.eq\(\s*"owner_id",\s*user\.id\s*\)/);
  assert.match(route, /\.select\("id, from_status, to_status, changed_at"\)/);
  assert.doesNotMatch(route, /changed_by/);
});

test("lost-post update returns conflict for illegal transitions without re-embedding status-only changes", async () => {
  const route = await readFile(
    "src/app/api/v1/lost-posts/[lostPostId]/route.ts",
    "utf8"
  );

  assert.match(route, /error\.code === "23514"/);
  assert.match(route, /허용되지 않은 상태 변경입니다/);
  assert.match(route, /embeddingFieldsChanged/);
  assert.match(route, /if \(embeddingFieldsChanged\)/);
});
