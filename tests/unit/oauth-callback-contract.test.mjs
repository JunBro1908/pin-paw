import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(
  join(root, "src/app/auth/callback/route.ts"),
  "utf8"
);

test("OAuth callback surfaces cancelled and failed auth states", () => {
  assert.match(source, /searchParams\.get\("error"\)/);
  assert.match(source, /auth.*cancelled|cancelled.*auth/);
  assert.match(source, /homeWithAuth\("failed"\)/);
  assert.match(source, /homeWithAuth\("denied"\)/);
});

test("OAuth callback does not silently succeed without a code", () => {
  assert.match(source, /if \(!code\) \{\s*return homeWithAuth\("failed"\);/);
});
