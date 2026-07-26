import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import test from "node:test";

async function collectTypeScriptFiles(root) {
  const pending = [root];
  const files = [];
  while (pending.length > 0) {
    const directory = pending.pop();
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const target = path.join(directory, entry.name);
      if (entry.isDirectory()) pending.push(target);
      if (entry.isFile() && /\.(?:ts|tsx)$/.test(entry.name)) files.push(target);
    }
  }
  return files;
}

test("the service-role factory is server-only, explicit, and fail-fast", async () => {
  const source = await readFile("src/shared/supabase/server.ts", "utf8");

  assert.match(source, /import ["']server-only["']/);
  assert.match(source, /createServiceRoleSupabase/);
  assert.doesNotMatch(source, /export const createServerSupabase\b/);
  assert.match(source, /SUPABASE_SERVICE_ROLE_KEY/);
  assert.doesNotMatch(source, /process\.env\.[A-Z0-9_]+!/);
});

test("client modules do not import the server Supabase boundary", async () => {
  const files = await collectTypeScriptFiles("src");

  for (const file of files) {
    const source = await readFile(file, "utf8");
    if (!/^["']use client["'];/m.test(source)) continue;
    assert.doesNotMatch(
      source,
      /shared\/supabase\/server/,
      `${file} imports the server-only Supabase module`
    );
  }
});
