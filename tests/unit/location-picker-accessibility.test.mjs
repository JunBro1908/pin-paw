import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("LocationPicker is a labelled keyboard-contained modal", async () => {
  const picker = await readFile(
    "src/features/map/components/LocationPicker.tsx",
    "utf8"
  );

  assert.match(picker, /role="dialog"/);
  assert.match(picker, /aria-modal="true"/);
  assert.match(picker, /aria-labelledby=\{titleId\}/);
  assert.match(picker, /<Text as="h2"[^>]+id=\{titleId\}/);
  assert.match(picker, /event\.key === "Escape"/);
  assert.match(picker, /event\.key !== "Tab"/);
  assert.match(picker, /querySelectorAll<HTMLElement>/);
  assert.match(picker, /searchInputRef\.current\?\.focus\(\)/);
  assert.match(picker, /previouslyFocusedElement\?\.focus\(\)/);
});

test("LocationPicker keeps teardown mount-only while Escape uses the latest onClose", async () => {
  const picker = await readFile(
    "src/features/map/components/LocationPicker.tsx",
    "utf8"
  );
  const lifecycleStart = picker.indexOf(
    "// 1. 컴포넌트 마운트 및 스크롤 잠금 처리"
  );
  const lifecycleEnd = picker.indexOf(
    "// 드롭다운 외부 클릭 시 닫기",
    lifecycleStart
  );
  assert.notEqual(lifecycleStart, -1);
  assert.notEqual(lifecycleEnd, -1);

  const lifecycleEffect = picker.slice(lifecycleStart, lifecycleEnd);
  assert.doesNotMatch(
    lifecycleEffect,
    /\}, \[onClose\]\);/,
    "onClose identity changes must not tear down a mounted picker"
  );
  assert.match(lifecycleEffect, /\}, \[\]\);/);
  assert.match(lifecycleEffect, /onCloseRef\.current\(\)/);
  assert.match(lifecycleEffect, /document\.body\.style\.overflow = "hidden"/);
  assert.match(lifecycleEffect, /document\.removeEventListener\("keydown"/);
  assert.match(
    lifecycleEffect,
    /document\.body\.style\.overflow = previousOverflow/
  );
  assert.match(lifecycleEffect, /previouslyFocusedElement\?\.focus\(\)/);
  assert.match(lifecycleEffect, /Event\.clearInstanceListeners\(/);
  assert.match(lifecycleEffect, /mapInstanceRef\.current\.destroy\(\)/);

  assert.match(picker, /const onCloseRef = useRef\(onClose\);/);
  assert.match(
    picker,
    /useEffect\(\(\) => \{\s*onCloseRef\.current = onClose;\s*\}, \[onClose\]\);/
  );
});

test("LocationPicker controls have labels, targets, and semantic surfaces", async () => {
  const picker = await readFile(
    "src/features/map/components/LocationPicker.tsx",
    "utf8"
  );

  assert.match(picker, /<label[^>]+htmlFor="location-search"/s);
  assert.match(picker, /id="location-search"/);
  assert.match(
    picker,
    /aria-label="위치 선택 닫기"[\s\S]*?className="[^"]*min-h-11[^"]*min-w-11/
  );
  assert.match(
    picker,
    /aria-label="현재 위치로 이동"[\s\S]*?className="[^"]*min-h-11[^"]*min-w-11/
  );
  assert.match(
    picker,
    /<Button[\s\S]*?variant="primary"[\s\S]*?>\s*이 위치로 선택/
  );
  assert.doesNotMatch(
    picker,
    /bg-primary[^"\n]*text-white|bg-red-500|text-red-500|bg-white|dark:bg-gray-800/
  );
  assert.doesNotMatch(
    picker,
    /(?:bg|text|border|ring|outline)-primary(?:\b|\/)/
  );
});

test("LocationPicker retains map selection and geolocation behavior", async () => {
  const picker = await readFile(
    "src/features/map/components/LocationPicker.tsx",
    "utf8"
  );

  assert.match(picker, /marker\.setPosition\(e\.coord\)/);
  assert.match(picker, /moveMapAndMarker\(item\.lat, item\.lng\)/);
  assert.match(picker, /navigator\.geolocation\.getCurrentPosition/);
  assert.match(picker, /onSelect\(position\.lat\(\), position\.lng\(\)\)/);
});
