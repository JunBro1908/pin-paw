import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const permissionMatrixPath = "tests/integration/db-permission-matrix.sql";
const concurrencyPath = "tests/integration/db-concurrency.mjs";
const statusHistoryPath =
  "supabase/migrations/20260725070000_lost_post_status_history.sql";
const embeddingJobsPath =
  "supabase/migrations/20260725000000_atomic_embedding_jobs.sql";
const rateLimitPath =
  "supabase/migrations/20260725020000_atomic_rate_limits.sql";

test("permission matrix covers funnel, share preview, and retired privacy RPCs", async () => {
  const sql = await readFile(permissionMatrixPath, "utf8");
  assert.match(sql, /funnel_events/);
  assert.match(sql, /get_public_lost_post_share_preview/);
  assert.match(sql, /get_block_filtered_sighting_markers/);
  assert.match(sql, /retired privacy RPC still executable/);
  assert.match(sql, /pinpaw_public_buckets_no_browser_/);
});

test("concurrency harness encodes 50-way rate limit and 20-way lease claims", async () => {
  const source = await readFile(concurrencyPath, "utf8");
  assert.match(source, /length: 50/);
  assert.match(source, /consume_rate_limit/);
  assert.match(source, /length: 20/);
  assert.match(source, /claim_embedding_jobs/);
});

test("status history rejects illegal terminal transitions", async () => {
  const sql = await readFile(statusHistoryPath, "utf8");
  assert.match(sql, /invalid_lost_post_status_transition/);
  assert.match(
    sql,
    /old\.status = 'searching' and new\.status in \('found', 'closed'\)/
  );
  assert.match(
    sql,
    /old\.status = 'found' and new\.status in \('searching', 'closed'\)/
  );
  assert.doesNotMatch(sql, /old\.status = 'closed' and new\.status/);
});

test("embedding jobs and rate limits are service-role scoped atomic RPCs", async () => {
  const jobs = await readFile(embeddingJobsPath, "utf8");
  const rates = await readFile(rateLimitPath, "utf8");
  assert.match(jobs, /claim_embedding_jobs/);
  assert.match(jobs, /complete_embedding_job/);
  assert.match(
    jobs,
    /grant execute on function public\.claim_embedding_jobs[\s\S]*?to service_role/i
  );
  assert.match(rates, /consume_rate_limit/);
  assert.match(
    rates,
    /grant execute on function public\.consume_rate_limit[\s\S]*?to service_role/i
  );
});
