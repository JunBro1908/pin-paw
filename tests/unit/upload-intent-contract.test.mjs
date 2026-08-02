import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationPath = "supabase/migrations/20260725030000_upload_intents.sql";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

test("upload intents bind keys to identity, purpose, MIME, size, and expiry", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create table public\.upload_intents/i);
  for (const column of [
    "object_key",
    "bucket_id",
    "purpose",
    "owner_id",
    "ip_hash",
    "expected_content_type",
    "expected_size_bytes",
    "expires_at",
    "consumed_at",
  ]) {
    assert.match(sql, new RegExp(`\\b${column}\\b`, "i"));
  }
  assert.match(sql, /enable row level security/i);
  assert.match(
    sql,
    /revoke all on table public\.upload_intents from anon, authenticated/i
  );
  assert.match(sql, /insert into storage\.buckets/i);
  assert.match(sql, /file_size_limit[\s\S]*10485760/i);
  assert.match(sql, /allowed_mime_types[\s\S]*image\/jpeg[\s\S]*image\/png/i);
});

test("browser roles cannot list, insert, replace, or delete upload objects", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /public[\s\S]*true[\s\S]*'sightings'[\s\S]*'lost'/i);
  assert.match(
    sql,
    /on conflict \(id\) do update[\s\S]*public\s*=\s*excluded\.public/i
  );
  for (const operation of ["select", "insert", "update", "delete"]) {
    assert.match(
      sql,
      new RegExp(
        `create policy "[^"]+"[\\s\\S]*?on storage\\.objects[\\s\\S]*?as restrictive[\\s\\S]*?for ${operation}[\\s\\S]*?to anon, authenticated[\\s\\S]*?bucket_id not in \\('sightings', 'lost'\\)`,
        "i"
      )
    );
  }
});

test("domain creation locks and consumes upload intents atomically", async () => {
  const sql = await source(migrationPath);

  assert.match(sql, /create function public\.create_sighting_with_uploads/i);
  assert.match(sql, /create function public\.create_lost_post_with_upload/i);
  assert.match(sql, /for update/i);
  assert.match(
    sql,
    /update public\.upload_intents[\s\S]*consumed_at = clock_timestamp\(\)/i
  );
  assert.match(
    sql,
    /grant execute on function public\.create_sighting_with_uploads[\s\S]*to service_role/i
  );
  assert.doesNotMatch(
    sql,
    /grant execute on function public\.create_(?:sighting|lost_post)_with_uploads?[\s\S]*to (?:anon|authenticated)/i
  );
});

test("presign records a short-lived intent before returning signed URLs", async () => {
  const route = await source("src/app/api/v1/uploads/presign/route.ts");

  assert.match(route, /\.from\("upload_intents"\)\s*\.insert/);
  assert.match(route, /UPLOAD_INTENT_TTL_MS/);
  assert.match(route, /createSignedUploadUrl/);
  assert.ok(
    route.indexOf('.from("upload_intents")') <
      route.indexOf("createSignedUploadUrl")
  );
});

test("create routes verify storage bytes and use intent-consuming RPCs", async () => {
  const verifier = await source("src/shared/lib/upload-intents.ts");
  const sighting = await source("src/app/api/v1/sightings/route.ts");
  const lostPost = await source("src/app/api/v1/lost-posts/route.ts");
  const lostPostUpdate = await source(
    "src/app/api/v1/lost-posts/[lostPostId]/route.ts"
  );

  assert.match(verifier, /download\(/);
  assert.match(verifier, /expected_size_bytes/);
  assert.match(verifier, /isJpeg|isPng/);
  assert.match(sighting, /verifyUploadIntents/);
  assert.match(sighting, /\.rpc\(\s*"create_sighting_with_uploads"/);
  assert.doesNotMatch(sighting, /\.from\("sightings"\)\s*\.insert/);
  assert.match(lostPost, /verifyUploadIntents/);
  assert.match(lostPost, /\.rpc\(\s*"create_lost_post_with_upload"/);
  assert.doesNotMatch(lostPost, /\.from\("lost_posts"\)\s*\.insert/);
  assert.match(lostPostUpdate, /verifyUploadIntents/);
  assert.match(lostPostUpdate, /purpose:\s*"lost_cover"/);
  assert.match(lostPostUpdate, /cover_photo_key/);
});

test("a fail-closed cron removes expired orphan objects through Storage API", async () => {
  const route = await source(
    "src/app/api/v1/internal/uploads/cleanup/route.ts"
  );
  const verifier = await source("src/shared/lib/upload-intents.ts");
  const vercel = await source("vercel.json");

  assert.match(route, /createCronAuthorizedValue/);
  assert.match(route, /cleanupExpiredUploadIntents/);
  assert.match(verifier, /\.remove\(keys\)/);
  assert.match(verifier, /\.lt\("created_at"/);
  assert.match(vercel, /\/api\/v1\/internal\/uploads\/cleanup/);
});
