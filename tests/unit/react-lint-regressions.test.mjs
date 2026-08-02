import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("auth banner does not set display state inside an effect", async () => {
  const source = await readFile(
    "src/features/auth/components/AuthFeedbackBanner.tsx",
    "utf8"
  );
  assert.doesNotMatch(source, /useEffect\([\s\S]*setMessage\(/);
  assert.match(source, /dismissedCode/);
});

test("map updates init ref in an effect, not during render", async () => {
  const source = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );
  assert.doesNotMatch(
    source,
    /const initMapRef = useRef\(initMap\);\s*initMapRef\.current = initMap/
  );
  assert.match(
    source,
    /useEffect\(\(\) => \{\s*initMapRef\.current = initMap;/
  );
});
