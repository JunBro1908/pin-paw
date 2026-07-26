import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const source = readFileSync(
  join(root, "src/features/map/components/NaverMap.tsx"),
  "utf8"
);

test("bookmark sightings effect does not clear default-layer markers", () => {
  assert.match(
    source,
    /if \(mapLayer !== "bookmark"\) return;/
  );
  assert.doesNotMatch(
    source,
    /paths:\s*mapLayer === "bookmark" \? pathData : \[\]/
  );
});
