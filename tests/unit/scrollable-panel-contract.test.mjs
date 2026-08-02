import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shared ScrollablePanel variants constrain mobile expandable surfaces", async () => {
  const panel = await readFile("src/shared/ui/ScrollablePanel.tsx", "utf8");
  assert.match(panel, /scrollable-dropdown/);
  assert.match(panel, /scrollable-panel/);
  assert.match(panel, /scrollable-list/);
  assert.match(panel, /scrollable-sheet/);
  assert.match(panel, /max-h-\[min\(40vh,16rem\)\]/);
  assert.match(panel, /max-h-\[min\(60vh,20rem\)\]/);
  assert.match(panel, /max-h-\[min\(50vh,18rem\)\]/);
  assert.match(panel, /max-h-\[min\(60vh,28rem\)\]/);
  assert.match(panel, /overscroll-contain/);
  assert.match(panel, /\[-webkit-overflow-scrolling:touch\]/);
  assert.match(panel, /safe-area-inset-bottom/);
});

test("scrollable panel CSS restores thin visible scrollbars", async () => {
  const css = await readFile("src/app/globals.css", "utf8");
  assert.match(css, /\.scrollable-dropdown/);
  assert.match(css, /scrollbar-width:\s*thin/);
  assert.match(
    css,
    /\.scrollable-dropdown::-webkit-scrollbar[\s\S]*?display:\s*block/
  );
});

test("key surfaces import ScrollablePanel or scrollablePanelClass", async () => {
  const files = [
    "src/app/(tabs)/recommend/page.tsx",
    "src/app/(tabs)/my/page.tsx",
    "src/features/sightings/components/SightingOptionalDetails.tsx",
    "src/features/lost-posts/components/LostPostForm.tsx",
    "src/features/map/components/LocationPicker.tsx",
    "src/features/moderation/components/ReportBlockSheet.tsx",
    "src/features/notifications/components/NotificationList.tsx",
  ];
  for (const file of files) {
    const source = await readFile(file, "utf8");
    assert.match(
      source,
      /ScrollablePanel|scrollablePanelClass/,
      `${file} should use shared scroll constraints`
    );
  }
});
