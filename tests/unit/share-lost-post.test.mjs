import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("shareLostPost builds public share URL and prefers Web Share API", async () => {
  const source = await readFile(
    "src/features/lost-posts/lib/share-lost-post.ts",
    "utf8"
  );
  assert.match(source, /\/share\/lost-posts\/\$\{lostPostId\}/);
  assert.match(source, /navigator\.share/);
  assert.match(source, /navigator\.clipboard\.writeText/);
  assert.match(source, /PinPaw 실종 제보/);
  assert.match(source, /정확한 위치와 메모는 포함되지 않습니다/);
});

test("ShareLostPostButton exposes 공유하기 control with send icon", async () => {
  const button = await readFile(
    "src/features/lost-posts/components/ShareLostPostButton.tsx",
    "utf8"
  );
  assert.match(button, /aria-label="공유하기"/);
  assert.match(button, /name="send"/);
  assert.match(button, /shareLostPost/);
  assert.match(button, /stopPropagation/);
  assert.doesNotMatch(button, />\s*공유\s*</);
});

test("active lost case card reuses share control on searching badge row", async () => {
  const card = await readFile(
    "src/features/lost-posts/components/ActiveLostCaseCard.tsx",
    "utf8"
  );
  assert.match(card, /ShareLostPostButton/);
  assert.match(card, /item\.status === "searching"/);
  assert.match(card, /justify-between/);
  assert.match(card, /공유 링크를 복사했습니다/);
  assert.match(card, /공유에 실패했습니다/);
});

test("lost post detail reuses ShareLostPostButton", async () => {
  const page = await readFile(
    "src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx",
    "utf8"
  );
  assert.match(page, /ShareLostPostButton/);
  assert.match(page, /lostPostId=\{item\.id\}/);
  assert.doesNotMatch(page, /navigator\.share/);
});
