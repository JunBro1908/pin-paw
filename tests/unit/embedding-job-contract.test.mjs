import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/migrations/20260725000000_atomic_embedding_jobs.sql",
  import.meta.url
);
const workerUrl = new URL(
  "../../src/app/api/v1/internal/embeddings/process/route.ts",
  import.meta.url
);

async function readMigration() {
  try {
    return await readFile(migrationUrl, "utf8");
  } catch {
    return "";
  }
}

test("claims embedding jobs with a bounded lease and skip-locked rows", async () => {
  const sql = await readMigration();

  assert.match(sql, /create or replace function public\.claim_embedding_jobs/i);
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /lease_token/i);
  assert.match(sql, /lease_expires_at/i);
  assert.match(
    sql,
    /greatest\(1,\s*least\(coalesce\(p_batch_size,\s*10\),\s*20\)\)/i
  );
  assert.match(
    sql,
    /greatest\(\s*30,\s*least\(coalesce\(p_lease_seconds,\s*300\),\s*900\)\s*\)/i
  );
});

test("finalizes success only for the current lease and updates the entity atomically", async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /create or replace function public\.complete_embedding_job/i
  );
  assert.match(
    sql,
    /where id = p_embedding_id[\s\S]*lease_token = p_lease_token/i
  );
  assert.match(sql, /update public\.sightings/i);
  assert.match(sql, /update public\.lost_posts/i);
});

test("records bounded retries without storing raw failure messages", async () => {
  const sql = await readMigration();

  assert.match(sql, /create or replace function public\.fail_embedding_job/i);
  assert.match(sql, /last_error_code/i);
  assert.match(sql, /next_attempt_at/i);
  assert.doesNotMatch(sql, /last_error_message/i);
});

test("exposes job RPCs only to the service role", async () => {
  const sql = await readMigration();

  for (const name of [
    "claim_embedding_jobs",
    "complete_embedding_job",
    "fail_embedding_job",
  ]) {
    assert.match(
      sql,
      new RegExp(`revoke all on function public\\.${name}`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${name}[\\s\\S]*to service_role`,
        "i"
      )
    );
  }
});

test("worker claims and finalizes jobs only through the lease RPC boundary", async () => {
  const source = await readFile(workerUrl, "utf8");

  assert.match(source, /\.rpc\(\s*"claim_embedding_jobs"/);
  assert.match(source, /\.rpc\(\s*"complete_embedding_job"/);
  assert.match(source, /\.rpc\(\s*"fail_embedding_job"/);
  assert.doesNotMatch(
    source,
    /\.from\("embeddings"\)[\s\S]{0,160}\.(select|update|delete)\(/
  );
});

test("Vercel Cron GET and internal POST share the fail-closed worker handler", async () => {
  const source = await readFile(workerUrl, "utf8");
  const vercel = await readFile(
    new URL("../../vercel.json", import.meta.url),
    "utf8"
  );

  assert.match(vercel, /\/api\/v1\/internal\/embeddings\/process/);
  assert.match(source, /export const GET = POST/);
  assert.match(source, /createCronAuthorizedValue/);
});
