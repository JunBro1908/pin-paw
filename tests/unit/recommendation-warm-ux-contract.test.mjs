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
  assert.match(page, /ScrollablePanel/);
  assert.match(
    page,
    /ScrollablePanel variant="results"[\s\S]*?RecommendationCard/
  );
  assert.match(page, /variant="secondary"[\s\S]*?>\s*적용\s*</);
  assert.match(page, /h-11 min-h-11 min-w-\[5\.5rem\]/);
  assert.match(page, /items-end/);
  assert.match(page, /text-xs leading-none/);
  assert.match(page, /aria-label="새로고침"/);
  assert.match(page, /name="refresh"/);
  assert.doesNotMatch(page, />\s*새로고침\s*</);
  assert.doesNotMatch(
    page,
    /aria-label="새로고침"[\s\S]{0,80}?variant="secondary"/
  );
  assert.doesNotMatch(page, /topK|TOP_K|추천 조건:|개수|toFixed\(1\)/i);
});

test("confirmation card leads with distance-time chips, date, match percent tip, and map CTA", async () => {
  const card = await readFile(cardPath, "utf8");

  // Two-column: photo left, chips/date/%/CTA in the right column (not full-bleed above).
  assert.match(
    card,
    /relative h-20 w-20[\s\S]*aria-label="거리·시간"[\s\S]*\{item\.matchPercent\}%[\s\S]*지도에서 보기/
  );
  assert.match(card, /items-stretch/);
  assert.match(card, /mt-auto[\s\S]*지도에서 보기/);
  assert.match(card, /item\.contextChips\.map/);
  assert.match(
    card,
    /variant="caption"[\s\S]*text-xs[\s\S]*\{occurredAt\}/
  );
  assert.match(
    card,
    /variant="caption"[\s\S]*text-sm[\s\S]*\{item\.matchPercent\}%/
  );
  assert.match(card, /items-center gap-1\.5/);
  assert.match(card, /rounded-full border border-current/);
  assert.match(card, /h-3\.5 w-3\.5/);
  assert.doesNotMatch(card, /variant="title"[\s\S]*\{item\.matchPercent\}%/);
  assert.doesNotMatch(
    card,
    /className="[^"]*text-2xl[^"]*"[\s\S]{0,120}\{item\.matchPercent\}%/
  );
  assert.match(card, /aria-label="유사도 안내"/);
  assert.match(card, /h-5 w-5 text-yellow-500/);
  assert.match(
    card,
    /유사도와 근거는 확인 순서를 돕기 위한 정보이며 동일한 동물임을 보장하지 않습니다\./
  );
  assert.match(card, /role="tooltip"/);
  assert.match(card, /지도에서 보기/);
  assert.match(card, /mapHref/);
  assert.match(card, /\/map\?lat=/);
  assert.match(card, /sightingId=/);
  assert.match(card, /북마크 등록/);
  assert.doesNotMatch(card, /상세 보기/);
  assert.doesNotMatch(card, /item\.matchSummary/);
  assert.doesNotMatch(card, /RECOMMENDATION_PRIORITY_LABELS/);
  assert.doesNotMatch(card, /후보|유력|참고/);
  assert.doesNotMatch(card, /openModal|SightingDetailCard|ReportBlockSheet/);
  assert.doesNotMatch(card, /item\.similarity|toFixed\(1\)|AI confidence|범위 안 제보|먼저 확인|함께 확인/);
  assert.doesNotMatch(card, /item\.evidence/);
});

test("recommendation hook keeps a private result limit of ten without a public topK parameter", async () => {
  const hook = await readFile(hookPath, "utf8");

  assert.doesNotMatch(hook, /topK\?:|params\?\.topK/);
  assert.match(hook, /topK:\s*String\(DEFAULT_TOP_K\)/);
  assert.match(hook, /const DEFAULT_TOP_K = 10/);
});

test("recommendation card uses the warm restrained surface treatment", async () => {
  const card = await readFile(cardPath, "utf8");

  assert.doesNotMatch(card, /rounded-\[32px\]|shadow-\[/);
  assert.match(card, /rounded-2xl/);
  assert.match(card, /shadow-sm/);
});
