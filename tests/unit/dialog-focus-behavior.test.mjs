import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function loadDialogFocusModule() {
  try {
    return await import("../../src/shared/ui/dialog-focus.ts");
  } catch (error) {
    assert.fail(`shared dialog focus helper must exist: ${error}`);
  }
}

test("dialog tab resolution wraps at both edges and recovers escaped focus", async () => {
  const { resolveDialogTabIndex } = await loadDialogFocusModule();

  assert.equal(
    resolveDialogTabIndex({ count: 3, activeIndex: 2, focusInside: true }),
    0
  );
  assert.equal(
    resolveDialogTabIndex({
      count: 3,
      activeIndex: 0,
      focusInside: true,
      shiftKey: true,
    }),
    2
  );
  assert.equal(
    resolveDialogTabIndex({ count: 3, activeIndex: -1, focusInside: false }),
    0
  );
  assert.equal(
    resolveDialogTabIndex({
      count: 3,
      activeIndex: -1,
      focusInside: false,
      shiftKey: true,
    }),
    2
  );
  assert.equal(
    resolveDialogTabIndex({ count: 3, activeIndex: 1, focusInside: true }),
    null
  );
});

test("report dialog keeps a single active modal focus lifecycle", async () => {
  const report = await readFile(
    "src/features/moderation/components/ReportBlockSheet.tsx",
    "utf8"
  );

  assert.match(report, /useDialogFocus/);
  assert.match(report, /ref=\{closeButtonRef\}/);
  assert.match(report, /min-h-11/);
  assert.match(report, /aria-modal="true"/);
});

test("recommendation card keeps chips outside controls and routes body taps to the map", async () => {
  const card = await readFile(
    "src/features/recommendations/components/RecommendationCard.tsx",
    "utf8"
  );
  const listMatch = card.match(/<ul[\s\n]+aria-label="거리·시간"/);
  assert.ok(listMatch?.index != null, "context chip list must exist");
  const listIndex = listMatch.index;

  const tokens = card.slice(0, listIndex).matchAll(/<button\b|<\/button>/g);
  let buttonDepth = 0;
  for (const token of tokens) {
    buttonDepth += token[0] === "</button>" ? -1 : 1;
  }
  assert.equal(buttonDepth, 0, "context chips cannot descend from a button");
  assert.match(card, /mapHref/);
  assert.match(card, /goToMap|router\.push\(mapHref\)/);
  assert.match(card, /지도에서 보기/);
  assert.doesNotMatch(card, /상세 보기|openModal/);
  assert.match(card, /handleClaimToggle/);
  assert.match(card, /onFeedbackChange\?\.\(\)/);
});
