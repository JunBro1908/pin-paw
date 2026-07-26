import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");

test("NaverMap remounts by calling initMap on mount, not only Script onLoad", () => {
  const source = readFileSync(
    join(root, "src/features/map/components/NaverMap.tsx"),
    "utf8"
  );
  assert.match(source, /initMapRef\.current = initMap/);
  assert.match(source, /initMapRef\.current\(\)/);
  assert.match(source, /attempts >= 50/);
  assert.match(source, /mapAdapterRef\.current\?\.dispose\(\)/);
  assert.match(source, /onReady=\{initMap\}/);
});

test("LocationPicker also re-inits cached Naver SDK via onReady + mount effect", () => {
  const source = readFileSync(
    join(root, "src/features/map/components/LocationPicker.tsx"),
    "utf8"
  );
  assert.match(source, /onReady=\{initMap\}/);
  assert.match(source, /useEffect\(\s*\(\)\s*=>\s*\{\s*initMap\(\);\s*\},\s*\[initMap\]\s*\)/);
  assert.match(source, /aria-label="위치 선택 닫기"/);
});

test("CSP allows Naver auth and tile hosts used by the Maps SDK", () => {
  const source = readFileSync(join(root, "next.config.ts"), "utf8");
  assert.match(source, /oapi\.map\.naver\.com/);
  assert.match(source, /\*\.map\.naver\.net/);
  assert.match(source, /\*\.naver\.net/);
  assert.match(source, /\*\.pstatic\.net/);
});
