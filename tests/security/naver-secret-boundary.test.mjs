import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(path, "utf8");
}

test("Naver search secret never uses a NEXT_PUBLIC environment name", async () => {
  const credentialSource = await source("src/shared/lib/naver-credentials.ts");
  const readinessSource = await source("src/shared/lib/operational-health.ts");
  const envExample = await source(".env.example");
  const workflow = await source(".github/workflows/release-gate.yml");

  for (const content of [
    credentialSource,
    readinessSource,
    envExample,
    workflow,
  ]) {
    assert.doesNotMatch(content, /NEXT_PUBLIC_NAVER_SECRET/);
  }

  assert.match(credentialSource, /NAVER_CLIENT_SECRET/);
  assert.match(readinessSource, /"NAVER_CLIENT_SECRET"/);
  assert.match(envExample, /^NAVER_CLIENT_SECRET=/m);
  assert.match(workflow, /NAVER_CLIENT_SECRET:/);
});

test("server-only secret names do not enter the browser static bundle", async () => {
  const forbidden =
    /(?:NAVER_CLIENT_SECRET|SUPABASE_SERVICE_ROLE_KEY|OPENAI_API_KEY|CRON_SECRET)/;
  const files = [];

  async function collect(directory) {
    let entries;
    try {
      entries = await readdir(directory, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      const path = `${directory}/${entry.name}`;
      if (entry.isDirectory()) await collect(path);
      else if (/\.(?:js|mjs|map)$/.test(entry.name)) files.push(path);
    }
  }

  await collect(".next/static");
  for (const file of files) {
    assert.doesNotMatch(await readFile(file, "utf8"), forbidden, file);
  }
});
