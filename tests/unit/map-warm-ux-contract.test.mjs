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
    assert.match(map, new RegExp(`import \\{ ${component} \\}`));
    assert.match(map, new RegExp(`<${component}`));
  }
});

test("legend explains every map source with text and shape", async () => {
  const legend = await readFile(
    "src/features/map/components/MapLegend.tsx",
    "utf8"
  );

  for (const label of ["목격", "유실", "보호소"]) {
    assert.match(legend, new RegExp(label));
  }
  for (const color of ["#087A3E", "#B85C1B", "#28736F"]) {
    assert.match(legend, new RegExp(color));
  }
  assert.match(legend, /aria-label="지도 표시 종류"/);
  assert.match(legend, /rounded-square/);
  assert.match(legend, /pin/);
});

test("toolbar keeps layer semantics explicit and guest-safe", async () => {
  const toolbar = await readFile(
    "src/features/map/components/MapToolbar.tsx",
    "utf8"
  );

  for (const label of ["전체", "새 목격", "저장한 흔적"]) {
    assert.match(toolbar, new RegExp(label));
  }
  assert.match(toolbar, /authenticated/);
  assert.match(toolbar, /min-h-11|min-h-\[44px\]|h-11|h-12/);
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
  assert.match(detail, /aria-modal="true"/);
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
  assert.match(detail, /!dialog\.contains\(active\)/);
  assert.match(detail, /previousFocusRef\.current\?\.focus\(\)/);
  assert.match(detail, /\}, \[\]\);/);
  assert.match(map, /\{mapDetailSelection && \(/);
  assert.match(map, /selection=\{mapDetailSelection\}/);
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
