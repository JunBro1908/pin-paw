import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath =
  "supabase/migrations/20260725040000_atomic_domain_idempotency.sql";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

test("domain creation serializes matching idempotency keys inside the transaction", async () => {
  const sql = await source(migrationPath);

  for (const functionName of [
    "create_sighting_with_uploads",
    "create_lost_post_with_upload",
  ]) {
    assert.match(
      sql,
      new RegExp(`create function public\\.${functionName}`, "i")
    );
    assert.match(
      sql,
      new RegExp(
        `revoke all on function public\\.${functionName}[\\s\\S]*?from public, anon, authenticated`,
        "i"
      )
    );
    assert.match(
      sql,
      new RegExp(
        `grant execute on function public\\.${functionName}[\\s\\S]*?to service_role`,
        "i"
      )
    );
  }

  assert.match(sql, /\bp_idempotency_key uuid\b/i);
  assert.match(sql, /\bp_request_hash text\b/i);
  assert.match(sql, /p_request_hash is null/i);
  assert.match(sql, /p_ip_hash is null/i);
  assert.match(sql, /pg_advisory_xact_lock/i);
  assert.match(sql, /from public\.idempotency_keys[\s\S]*for update/i);
  assert.match(
    sql,
    /idempotency_conflict/i,
    "same key with a different request must fail closed"
  );
});

test("domain row, consumed intents, and cached response share one database transaction", async () => {
  const sql = await source(migrationPath);

  for (const domainTable of ["sightings", "lost_posts"]) {
    assert.match(
      sql,
      new RegExp(
        `insert into public\\.${domainTable}[\\s\\S]*update public\\.upload_intents[\\s\\S]*insert into public\\.idempotency_keys`,
        "i"
      )
    );
  }

  assert.match(sql, /jsonb_build_object\(\s*'success', true,\s*'data'/i);
  assert.match(sql, /return v_(?:sighting|lost_post)/i);
});

test("create routes delegate idempotency to the atomic domain RPC", async () => {
  const sighting = await source("src/app/api/v1/sightings/route.ts");
  const lostPost = await source("src/app/api/v1/lost-posts/route.ts");

  for (const route of [sighting, lostPost]) {
    assert.match(route, /request\.headers\.get\("Idempotency-Key"\)/);
    assert.match(route, /isValidUuid/);
    assert.match(route, /p_idempotency_key:\s*idempotencyKey/);
    assert.match(route, /p_request_hash:\s*requestHash/);
    assert.match(route, /invalid_upload_intent[\s\S]*409/);
    assert.doesNotMatch(route, /\.from\("idempotency_keys"\)/);
    assert.ok(
      route.indexOf("const replay = await getIdempotencyReplay") <
        route.indexOf("const uploadVerification = await verifyUploadIntents"),
      "cached responses must bypass consumed-intent verification"
    );
  }
  assert.ok(
    sighting.indexOf("const replay = await getIdempotencyReplay") <
      sighting.indexOf(
        "const rateLimitResult = await checkRateLimitDimensions"
      ),
    "cached retries must not be rejected by the create-request rate limit"
  );
});
