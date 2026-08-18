import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("photo carousel uses swipe scrolling and dots instead of oversized arrow controls", async () => {
  const source = await readFile("src/shared/ui/PhotoCarousel.tsx", "utf8");

  assert.match(source, /overflow-x-auto/);
  assert.match(source, /snap-x/);
  assert.match(source, /snap-mandatory/);
  assert.match(source, /aria-label=\{`\$\{current \+ 1\}번째 사진 선택됨`\}/);
  assert.doesNotMatch(source, /aria-label="이전 사진"/);
  assert.doesNotMatch(source, /aria-label="다음 사진"/);
});

test("my sightings card opts into quiet automatic photo rotation", async () => {
  const source = await readFile(
    "src/features/sightings/components/MySightingCard.tsx",
    "utf8"
  );

  assert.match(source, /autoPlay/);
  assert.match(source, /intervalMs=\{1000\}/);
  assert.match(source, /showIndicators=\{false\}/);
});
