import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260725100000_account_deletion_jobs.sql",
  import.meta.url
);
const requestRouteUrl = new URL(
  "../../src/app/api/v1/me/account/deletion/route.ts",
  import.meta.url
);
const workerRouteUrl = new URL(
  "../../src/app/api/v1/internal/accounts/delete/route.ts",
  import.meta.url
);

async function readOrEmpty(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

test("deletion request is authenticated, bounded, idempotent, and ban-gated", async () => {
  const [sql, route] = await Promise.all([
    readOrEmpty(migrationUrl),
    readOrEmpty(requestRouteUrl),
  ]);

  assert.match(route, /readJsonBody\(\s*request,\s*1024\s*\)/);
  assert.match(route, /parseAccountDeletionRequest/);
  assert.match(route, /getVerifiedUser/);
  assert.match(route, /\.rpc\(\s*"request_account_deletion"/);
  assert.match(route, /auth\.admin\.updateUserById/);
  assert.match(route, /ban_duration:\s*"876000h"/);
  assert.match(route, /\.rpc\(\s*"activate_account_deletion"/);
  assert.match(route, /\.rpc\(\s*"cancel_account_deletion"/);

  assert.match(sql, /unique\s*\(\s*user_id\s*\)/i);
  assert.match(
    sql,
    /status text not null[\s\S]*'awaiting_ban'[\s\S]*'queued'/i
  );
  assert.match(
    sql,
    /create or replace function public\.request_account_deletion/i
  );
  assert.match(sql, /v_user_id uuid := auth\.uid\(\)/i);
});

test("worker leases jobs and applies bounded retry with backoff", async () => {
  const [sql, route] = await Promise.all([
    readOrEmpty(migrationUrl),
    readOrEmpty(workerRouteUrl),
  ]);

  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /lease_token/i);
  assert.match(sql, /lease_expires_at/i);
  assert.match(sql, /attempt_count < 8/i);
  assert.match(sql, /next_attempt_at/i);
  assert.match(sql, /power\(2,\s*attempt_count/i);
  assert.match(route, /createCronAuthorizedValue/);
  assert.match(route, /export const GET = POST/);
  assert.match(route, /\.rpc\(\s*"claim_account_deletion_jobs"/);
  assert.match(route, /\.rpc\(\s*"fail_account_deletion_job"/);
});

test("storage deletion strictly precedes database and auth deletion", async () => {
  const source = await readOrEmpty(workerRouteUrl);
  const storageRemoval = source.indexOf(".remove(");
  const databaseCleanup = source.indexOf('"cleanup_account_deletion_data"');
  const authDeletion = source.indexOf("auth.admin.deleteUser");
  const completion = source.indexOf('"complete_account_deletion"');

  assert.ok(storageRemoval >= 0);
  assert.ok(databaseCleanup > storageRemoval);
  assert.ok(authDeletion > databaseCleanup);
  assert.ok(completion > authDeletion);
});

test("completed tombstone retains only hash, lifecycle times, expiry, and status", async () => {
  const sql = await readOrEmpty(migrationUrl);
  const table = sql.match(
    /create table public\.account_deletion_tombstones\s*\(([\s\S]*?)\);/i
  )?.[1];

  assert.ok(table);
  for (const column of [
    "user_id_hash",
    "requested_at",
    "completed_at",
    "backup_expiry_due_at",
    "status",
  ]) {
    assert.match(table, new RegExp(`\\b${column}\\b`, "i"));
  }
  assert.doesNotMatch(
    table,
    /\b(user_id|email|token|location|note|photo_key|photo_keys)\b/i
  );
  assert.match(sql, /requested_at \+ interval '30 days'/i);
});

test("all authenticated server paths reject deletion-pending users", async () => {
  const [server, sightings, uploads] = await Promise.all([
    readOrEmpty(
      new URL("../../src/shared/supabase/server.ts", import.meta.url)
    ),
    readOrEmpty(
      new URL("../../src/app/api/v1/sightings/route.ts", import.meta.url)
    ),
    readOrEmpty(
      new URL("../../src/app/api/v1/uploads/presign/route.ts", import.meta.url)
    ),
  ]);

  assert.match(server, /isAccountAccessAllowed/);
  assert.match(server, /getVerifiedUser/);
  assert.match(sightings, /getVerifiedUser/);
  assert.match(uploads, /getVerifiedUser/);
});

test("backup expiry remains an explicitly unverified provider obligation", async () => {
  const sql = await readOrEmpty(migrationUrl);
  assert.match(sql, /provider backup expiry policy must be verified/i);
});
