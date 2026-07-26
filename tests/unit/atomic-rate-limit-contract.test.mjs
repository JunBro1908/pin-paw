import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260725020000_atomic_rate_limits.sql",
  import.meta.url
);
const implementationUrl = new URL(
  "../../src/shared/lib/rate-limit.ts",
  import.meta.url
);

async function read(url) {
  try {
    return await readFile(url, "utf8");
  } catch {
    return "";
  }
}

test("increments a unique fixed-window bucket atomically", async () => {
  const sql = await read(migrationUrl);

  assert.match(sql, /create table if not exists public\.rate_limit_buckets/i);
  assert.match(
    sql,
    /primary key \(scope,\s*identifier_hash,\s*window_seconds,\s*window_started_at\)/i
  );
  assert.match(
    sql,
    /on conflict \(scope,\s*identifier_hash,\s*window_seconds,\s*window_started_at\)/i
  );
  assert.match(
    sql,
    /do update set\s+request_count = [^\n]*request_count \+ 1/i
  );
  assert.match(sql, /updated_at < v_now - interval '2 days'/i);
});

test("bounds inputs and exposes the consume RPC only to service role", async () => {
  const sql = await read(migrationUrl);

  assert.match(sql, /create or replace function public\.consume_rate_limit/i);
  assert.match(sql, /p_window_seconds not between 1 and 86400/i);
  assert.match(sql, /p_max_requests not between 1 and 10000/i);
  assert.match(sql, /revoke all on function public\.consume_rate_limit/i);
  assert.match(
    sql,
    /grant execute on function public\.consume_rate_limit[\s\S]*to service_role/i
  );
});

test("application limiter uses the atomic RPC instead of count-then-record", async () => {
  const source = await read(implementationUrl);

  assert.match(source, /\.rpc\(\s*"consume_rate_limit"/);
  assert.doesNotMatch(source, /\.from\("idempotency_keys"\)/);
  assert.match(source, /`\$\{scope\}:ip`/);
  assert.match(source, /`\$\{scope\}:user`/);
});
