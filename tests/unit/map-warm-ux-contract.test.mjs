import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const components = ["MapLegend", "MapToolbar", "MapDetailSheet"];

test("map controller delegates the warm map surfaces", async () => {
  const map = await readFile(
    "src/features/map/components/NaverMap.tsx",
    "utf8"
  );

  for (const component of components) {
    assert.match(map, new RegExp(`import \\{[^}]*\\b${component}\\b[^}]*\\}`));
    assert.match(map, new RegExp(`<${component}`));
  }
});

test("legend keeps a compact brand chip without colored source tags", async () => {
  const legend = await readFile(
    "src/features/map/components/MapLegend.tsx",
    "utf8"
  );

  assert.match(legend, /PinPaw 지도/);
  assert.match(legend, /aria-label="지도 제목"/);
  assert.match(legend, /left-1\/2|-translate-x-1\/2/);
  assert.doesNotMatch(legend, /#087A3E|#B85C1B|#28736F/);
});

test("toolbar keeps layer semantics explicit and guest-safe", async () => {
  const toolbar = await readFile(
    "src/features/map/components/MapToolbar.tsx",
    "utf8"
  );

  assert.match(toolbar, /전체/);
  assert.match(toolbar, /신규 제보/);
  assert.match(toolbar, /aria-label="저장한 흔적"/);
  assert.match(toolbar, /name="star"/);
  assert.doesNotMatch(toolbar, /새 목격/);
  assert.doesNotMatch(toolbar, />저장한 흔적</);
  assert.match(toolbar, /authenticated/);
  assert.match(toolbar, /min-h-11|min-h-\[44px\]|h-11|h-12/);
});

test("detail sheet explains source type for lost posts", async () => {
  const detail = await readFile(
    "src/features/map/components/MapDetailSheet.tsx",
    "utf8"
  );

  assert.match(detail, /MapSourceExplanation/);
  assert.match(detail, /유실 사건/);
  assert.match(detail, /보호자가 등록한 유실/);
});

test("detail sheet has one labelled surface and an accessible close target", async () => {
  const detail = await readFile(
    "src/features/map/components/MapDetailSheet.tsx",
    "utf8"
  );

  assert.equal(
    (detail.match(/<aside\b/g) ?? []).length,
    1,
    "the extracted detail surface owns exactly one aside"
  );
  assert.match(detail, /aria-label="선택한 지도 정보"/);
  assert.match(detail, /role="dialog"/);
  assert.match(detail, /aria-modal=\{keyboardActive \? "true" : undefined\}/);
  assert.match(detail, /aria-label="선택한 지도 정보 닫기"/);
  assert.match(detail, /h-11 w-11|min-h-\[44px\].*min-w-\[44px\]/);
});

test("detail dialog owns a mount-only keyboard and focus lifecycle", async () => {
  const [detail, map] = await Promise.all([
    readFile("src/features/map/components/MapDetailSheet.tsx", "utf8"),
    readFile("src/features/map/components/NaverMap.tsx", "utf8"),
  ]);

  assert.match(detail, /previousFocusRef/);
  assert.match(detail, /onCloseRef/);
  assert.match(detail, /closeButtonRef\.current\?\.focus\(\)/);
  assert.match(detail, /event\.key === "Escape"/);
  assert.match(detail, /event\.key !== "Tab"/);
  assert.match(detail, /querySelectorAll<HTMLElement>/);
  assert.match(detail, /!dialog\.contains\(activeElement\)/);
  assert.match(detail, /previousFocusRef\.current\?\.focus\(\)/);
  assert.match(detail, /\}, \[\]\);/);
  assert.match(map, /\{mapDetailSelection && \(/);
  assert.match(map, /selection=\{mapDetailSelection\}/);
});

test("bookmark dialog is the only keyboard owner while nested", async () => {
  const [detail, map] = await Promise.all([
    readFile("src/features/map/components/MapDetailSheet.tsx", "utf8"),
    readFile("src/features/map/components/NaverMap.tsx", "utf8"),
  ]);

  assert.match(detail, /keyboardActive/);
  assert.match(detail, /if \(!keyboardActive\) return;/);
  assert.match(detail, /\}, \[keyboardActive\]\);/);
  assert.match(detail, /aria-hidden=\{keyboardActive \? undefined : true\}/);
  assert.match(detail, /inert=\{keyboardActive \? undefined : true\}/);
  assert.match(map, /keyboardActive=\{!bookmarkModalOpen\}/);
  assert.match(map, /bookmarkDialogRef/);
  assert.match(map, /bookmarkCloseButtonRef\.current\?\.focus\(\)/);
  assert.match(map, /bookmarkOpenerRef\.current\?\.focus\(\)/);
  assert.match(map, /trapDialogTab\(event, dialog\)/);
  assert.match(map, /aria-label="북마크 선택 닫기"/);
  assert.match(map, /h-11 w-11/);
});

test("extracted controller surfaces use only restrained warm treatments", async () => {
  const sources = await Promise.all(
    components.map((component) =>
      readFile(`src/features/map/components/${component}.tsx`, "utf8")
    )
  );

  for (const source of sources) {
    assert.match(source, /bg-surface|border-border-subtle|rounded-2xl/);
    assert.doesNotMatch(
      source,
      /linear-gradient|bg-gradient|backdrop-blur|rounded-\[28px\]|shadow-(?:md|lg|xl|2xl)|shadow-\[/
    );
  }
});
