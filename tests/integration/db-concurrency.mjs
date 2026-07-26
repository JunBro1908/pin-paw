import assert from "node:assert/strict";
import { promisify } from "node:util";
import { execFile } from "node:child_process";

const execFileAsync = promisify(execFile);
const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  "postgresql://postgres:postgres@127.0.0.1:54322/postgres";

async function sql(statement) {
  const { stdout } = await execFileAsync(
    "psql",
    [databaseUrl, "-X", "-v", "ON_ERROR_STOP=1", "-Atq", "-c", statement],
    { maxBuffer: 1024 * 1024 }
  );
  return stdout.trim();
}

async function verifyAtomicRateLimit() {
  const scope = `ci-concurrency-${Date.now()}`;
  const identifier = "a".repeat(64);
  const maximum = 7;

  const results = await Promise.all(
    Array.from({ length: 50 }, () =>
      sql(`
        select allowed
        from public.consume_rate_limit(
          '${scope}',
          '${identifier}',
          60,
          ${maximum}
        );
      `)
    )
  );

  assert.equal(
    results.filter((result) => result === "t").length,
    maximum,
    "50 concurrent requests must not approve more than the configured maximum"
  );

  await sql(`
    delete from public.rate_limit_buckets
    where scope = '${scope}' and identifier_hash = '${identifier}';
  `);
}

async function verifySingleEmbeddingLease() {
  const embeddingId = "10000000-0000-4000-8000-000000000001";
  const entityId = "20000000-0000-4000-8000-000000000001";

  await sql(`
    delete from public.embeddings where id = '${embeddingId}';
    insert into public.embeddings (
      id,
      entity_type,
      entity_id,
      modality,
      model,
      status,
      retry_count
    ) values (
      '${embeddingId}',
      'lost_post',
      '${entityId}',
      'text',
      'text-embedding-3-small',
      'pending',
      0
    );
  `);

  const claims = await Promise.all(
    Array.from({ length: 20 }, () =>
      sql(`
        select id
        from public.claim_embedding_jobs(1, 300)
        where id = '${embeddingId}';
      `)
    )
  );

  assert.equal(
    claims.filter((result) => result === embeddingId).length,
    1,
    "overlapping workers must lease an embedding job exactly once"
  );

  await sql(`delete from public.embeddings where id = '${embeddingId}';`);
}

await verifyAtomicRateLimit();
await verifySingleEmbeddingLease();

console.log("Database concurrency checks passed (rate limit 50-way, lease 20-way)");
