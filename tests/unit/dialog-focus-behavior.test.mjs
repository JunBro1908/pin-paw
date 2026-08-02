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

test("detail and report dialogs share one focus lifecycle with a single active modal", async () => {
  const [card, report] = await Promise.all([
    readFile(
      "src/features/recommendations/components/RecommendationCard.tsx",
      "utf8"
    ),
    readFile("src/features/moderation/components/ReportBlockSheet.tsx", "utf8"),
  ]);

  assert.match(card, /useDialogFocus/);
  assert.match(card, /active:\s*!reportOpen/);
  assert.match(card, /aria-modal=\{reportOpen \? undefined : "true"\}/);
  assert.match(card, /aria-hidden=\{reportOpen \? true : undefined\}/);
  assert.match(card, /inert=\{reportOpen \? true : undefined\}/);
  assert.match(report, /useDialogFocus/);
  assert.match(report, /ref=\{closeButtonRef\}/);
  assert.match(report, /min-h-11/);
  assert.match(report, /aria-modal="true"/);
});

test("evidence list is outside every button and the discrete detail action remains", async () => {
  const card = await readFile(
    "src/features/recommendations/components/RecommendationCard.tsx",
    "utf8"
  );
  const listMatch = card.match(/<ul[\s\n]+aria-label="확인 근거"/);
  assert.ok(listMatch?.index != null, "evidence list must exist");
  const listIndex = listMatch.index;

  const tokens = card.slice(0, listIndex).matchAll(/<button\b|<\/button>/g);
  let buttonDepth = 0;
  for (const token of tokens) {
    buttonDepth += token[0] === "</button>" ? -1 : 1;
  }
  assert.equal(buttonDepth, 0, "evidence list cannot descend from a button");
  assert.match(
    card,
    /<button[\s\S]*?onClick=\{openModal\}[\s\S]*?min-h-11[\s\S]*?>[\s\S]*?상세 보기[\s\S]*?<\/button>/
  );
  assert.match(card, /handleClaimToggle/);
  assert.match(card, /setReportOpen\(true\)/);
  assert.match(card, /handleMapClick/);
  assert.match(card, /onFeedbackChange\?\.\(\)/);
});
