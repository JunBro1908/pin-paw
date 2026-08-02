import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = "src/app/(tabs)/recommend/page.tsx";
const cardPath =
  "src/features/recommendations/components/RecommendationCard.tsx";
const hookPath = "src/features/recommendations/hooks/useRecommendations.ts";

test("confirmation page presents a review workflow without model or result-count controls", async () => {
  const page = await readFile(pagePath, "utf8");

  assert.match(page, /<Text as="h1"[^>]*>\s*비슷한 제보 찾기\s*<\/Text>/);
  assert.match(
    page,
    /유실글을 고르면 가능성이 높은 목격 제보를 모아 보여드려요/
  );
  assert.match(page, /<summary[^>]*>[\s\S]*?탐색 범위[\s\S]*?<\/summary>/);
  assert.match(page, /반경[\s\S]*?기간[\s\S]*?적용/);
  assert.match(page, /새로고침/);
  assert.doesNotMatch(
    page,
    /topK|TOP_K|추천 조건:|개수|유사한|유사도|similarity/i
  );
});

test("confirmation card renders priority, time, evidence, uncertainty, and rescue actions", async () => {
  const card = await readFile(cardPath, "utf8");

  assert.match(card, /RECOMMENDATION_PRIORITY_LABELS\[item\.priority\]/);
  assert.match(card, /occurredAt/);
  assert.match(card, /<ul\s[\s\S]*?aria-label="확인 근거"[\s\S]*?>/);
  assert.match(card, /item\.evidence\.map/);
  assert.match(
    card,
    /근거는 확인 순서를 돕기 위한 정보이며 동일한 동물임을\s*보장하지 않습니다\./
  );
  assert.match(card, /북마크 등록/);
  assert.match(card, /신고 \/ 차단/);
  assert.match(card, /지도에서 보기/);
  assert.doesNotMatch(card, /similarity|유사도|toFixed\(1\)|AI confidence/i);
});

test("recommendation hook keeps a private result limit of ten without a public topK parameter", async () => {
  const hook = await readFile(hookPath, "utf8");

  assert.doesNotMatch(hook, /topK\?:|params\?\.topK/);
  assert.match(hook, /topK:\s*String\(DEFAULT_TOP_K\)/);
  assert.match(hook, /const DEFAULT_TOP_K = 10/);
});

test("touched modal feedback surfaces use the warm restrained surface treatment", async () => {
  const card = await readFile(cardPath, "utf8");

  assert.doesNotMatch(card, /rounded-\[32px\]|shadow-\[/);
  assert.match(card, /rounded-2xl/);
  assert.match(card, /shadow-sm/);
});
