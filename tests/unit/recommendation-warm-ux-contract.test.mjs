import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const pagePath = "src/app/(tabs)/recommend/page.tsx";
const cardPath =
  "src/features/recommendations/components/RecommendationCard.tsx";
const hookPath = "src/features/recommendations/hooks/useRecommendations.ts";

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
  assert.match(
    card,
    /import \{\s*buildRecommendationMapHref\s*\} from "@\/features\/map\/lib\/map-deep-link-focus";/
  );
  assert.match(
    card,
    /const mapHref = buildRecommendationMapHref\(\s*item\.sightingId,\s*lostPostId\s*\);/
  );
  assert.match(card, /router\.push\(mapHref\)/);

  // 추천 결과의 마스킹된 좌표를 URL 중심점으로 직접 사용하지 않는다.
  assert.doesNotMatch(card, /\/map\?lat=/);
  assert.doesNotMatch(card, /item\.lat/);
  assert.doesNotMatch(card, /item\.lng/);

  assert.match(card, /북마크 등록/);
  assert.doesNotMatch(card, /상세 보기/);
  assert.doesNotMatch(card, /item\.matchSummary/);
  assert.doesNotMatch(card, /RECOMMENDATION_PRIORITY_LABELS/);
  assert.doesNotMatch(card, /후보|유력|참고/);
  assert.doesNotMatch(card, /openModal|SightingDetailCard|ReportBlockSheet/);
  assert.doesNotMatch(
    card,
    /item\.similarity|toFixed\(1\)|AI confidence|범위 안 제보|먼저 확인|함께 확인/
  );
  assert.doesNotMatch(card, /item\.evidence/);
});