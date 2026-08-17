import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function source(path) {
  return readFile(path, "utf8");
}

test("conditional map responses preserve their cache visibility policy", async () => {
  const responseSource = await source("src/shared/lib/api-response.ts");
  const publicRoute = await source(
    "src/app/api/v1/public/map/clusters/route.ts"
  );
  const authenticatedRoute = await source(
    "src/app/api/v1/auth/map/markers/route.ts"
  );

  assert.match(responseSource, /notModified\(headers\?: HeadersInit\)/);
  assert.match(
    publicRoute,
    /notModified\(\{[\s\S]*?ETag:\s*etag,[\s\S]*?["']Cache-Control["']:\s*["']public, max-age=0, must-revalidate/
  );
  assert.match(
    authenticatedRoute,
    /notModified\(\{[\s\S]*?ETag:\s*etag,[\s\S]*?["']Cache-Control["']:\s*["']private, max-age=0, must-revalidate/
  );
});
