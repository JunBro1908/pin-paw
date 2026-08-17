import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const workflowPath = ".github/workflows/release-gate.yml";

async function source(path) {
  return readFile(path, "utf8").catch(() => "");
}

test("release gate runs on pull requests with least-privilege permissions", async () => {
  const workflow = await source(workflowPath);

  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /permissions:\s*\n\s+contents: read/);
  assert.match(workflow, /timeout-minutes:/);
  assert.doesNotMatch(workflow, /pull-requests: write|contents: write/);
});

test("release gate uses the locked Node version and reproducible install", async () => {
  const workflow = await source(workflowPath);
  const nodeVersion = (await source(".nvmrc")).trim();

  assert.equal(nodeVersion, "22");
  assert.match(workflow, /node-version-file: ['"]?\.nvmrc/);
  assert.match(workflow, /cache: ['"]?npm/);
  assert.match(workflow, /run: npm ci/);
});

test("release gate requires tests, types, lint, Webpack build, and production audit", async () => {
  const workflow = await source(workflowPath);
  const packageJson = JSON.parse(await source("package.json"));

  for (const command of [
    "npm test",
    "npm run typecheck",
    "npm run lint",
    "npm run build",
    "npm run test:integration",
    "npm audit --omit=dev --audit-level=low",
  ]) {
    assert.ok(workflow.includes(`run: ${command}`), command);
  }
  assert.equal(packageJson.scripts.typecheck, "tsc --noEmit");
  assert.equal(
    packageJson.scripts["test:integration"],
    "node tests/integration/http-boundaries.mjs"
  );
  assert.equal(packageJson.scripts.build, "next build --webpack");
  assert.equal(packageJson.scripts.dev, "next dev --webpack");
  assert.equal(packageJson.overrides.nanoid, "3.3.18");
  assert.match(workflow, /npm sbom --sbom-format=cyclonedx/);
  assert.match(workflow, /actions\/upload-artifact@v4/);
  assert.match(workflow, /if-no-files-found: error/);
});

test("CI build uses non-secret synthetic environment values", async () => {
  const workflow = await source(workflowPath);

  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL:/);
  assert.match(workflow, /SUPABASE_SERVICE_ROLE_KEY:/);
  assert.doesNotMatch(workflow, /\$\{\{\s*secrets\./);
});

test("release gate replays migrations and checks the real database permission matrix", async () => {
  const workflow = await source(workflowPath);
  const packageJson = JSON.parse(await source("package.json"));

  assert.match(workflow, /database-replay:/);
  assert.match(workflow, /run: npm run db:start/);
  assert.match(workflow, /run: npm run db:reset/);
  assert.match(workflow, /tests\/integration\/db-permission-matrix\.sql/);
  assert.match(workflow, /run: npm run test:db-concurrency/);
  assert.match(workflow, /if: always\(\)[\s\S]*run: npm run db:stop/);
  assert.equal(packageJson.scripts["db:reset"], "supabase db reset --local");
  assert.equal(
    packageJson.scripts["test:db-concurrency"],
    "node tests/integration/db-concurrency.mjs"
  );
});
