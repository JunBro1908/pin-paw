import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725130000_owner_sighting_mutations.sql";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

test("owner sighting update is one atomic, idempotent transaction", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create function public\.update_owned_sighting/i);
  assert.match(sql, /p_actor_id uuid/i);
  assert.match(sql, /p_idempotency_key uuid/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /user_id = p_actor_id/i);
  assert.match(sql, /author_type = 'user'/i);
  assert.match(sql, /hidden_at is null/i);
  assert.match(sql, /archived_at is null/i);
  assert.match(sql, /cardinality\(p_photo_keys\) not between 1 and 3/i);
  assert.match(sql, /update public\.sightings[\s\S]*embedding_status = 'pending'/i);
  assert.match(sql, /update public\.embeddings[\s\S]*status = 'pending'/i);
  assert.match(sql, /delete from public\.recommendation_cache/i);
  assert.match(sql, /insert into public\.sighting_mutation_audit/i);
  assert.match(sql, /insert into public\.storage_cleanup_queue/i);
  assert.match(sql, /update public\.upload_intents[\s\S]*consumed_at/i);
  assert.match(sql, /insert into public\.idempotency_keys/i);
});

test("owner deletion queues photos and audits instead of route table deletion", async () => {
  const sql = await source(migrationPath);
  const route = await source(
    "src/app/api/v1/me/sightings/[sightingId]/route.ts"
  );

  assert.match(sql, /create function public\.delete_owned_sighting/i);
  assert.match(
    sql,
    /insert into public\.storage_cleanup_queue[\s\S]*delete from public\.sightings/i
  );
  assert.match(sql, /'delete'/i);
  assert.match(route, /\.rpc\("delete_owned_sighting"/);
  assert.doesNotMatch(route, /\.from\("sightings"\)[\s\S]*?\.delete\(\)/);
});

test("cleanup queue uses service-only lease, retry backoff, and completion RPCs", async () => {
  const sql = await source(migrationPath);
  const cleanup = await source("src/shared/lib/upload-intents.ts");

  for (const name of [
    "lease_storage_cleanup_jobs",
    "complete_storage_cleanup_job",
    "fail_storage_cleanup_job",
  ]) {
    assert.match(sql, new RegExp(`create function public\\.${name}`, "i"));
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${name}[\\s\\S]*?grant execute[\\s\\S]*?to service_role`,
        "i"
      )
    );
  }
  assert.match(sql, /for update skip locked/i);
  assert.match(sql, /power\(2/i);
  assert.match(cleanup, /lease_storage_cleanup_jobs/);
  assert.match(cleanup, /complete_storage_cleanup_job/);
  assert.match(cleanup, /fail_storage_cleanup_job/);
  assert.ok(
    cleanup.indexOf(".remove(") <
      cleanup.indexOf('"complete_storage_cleanup_job"'),
    "queue completion must happen only after Storage deletion"
  );
});

test("PATCH verifies only newly introduced upload intents before atomic RPC", async () => {
  const route = await source(
    "src/app/api/v1/me/sightings/[sightingId]/route.ts"
  );

  assert.match(route, /export async function PATCH/);
  assert.match(route, /parseSightingUpdateRequest/);
  assert.match(route, /verifyUploadIntents/);
  assert.match(route, /\.rpc\("update_owned_sighting"/);
  assert.match(route, /Idempotency-Key/);
});
