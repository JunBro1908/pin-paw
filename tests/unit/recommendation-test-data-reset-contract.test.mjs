import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL(
  "../../supabase/scripts/reset_test_domain_data.sql",
  import.meta.url
);

test("test-data reset clears recommendation domain data without removing accounts or settings", async () => {
  const sql = await readFile(migrationUrl, "utf8");

  assert.match(sql, /truncate table/i);
  for (const table of [
    "recommendation_cache",
    "embeddings",
    "sightings",
    "lost_posts",
    "upload_intents",
    "idempotency_keys",
  ]) {
    assert.match(sql, new RegExp(`public\\.${table}`));
  }
  assert.doesNotMatch(sql, /public\.users/i);
  assert.doesNotMatch(sql, /auth\.users/i);
  assert.doesNotMatch(sql, /operational_settings/i);
});
