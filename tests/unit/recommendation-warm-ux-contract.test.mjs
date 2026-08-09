import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const cardPath =
  "src/features/recommendations/components/RecommendationCard.tsx";

test("confirmation card leads with distance-time chips, display fit score, grouped evidence, and map CTA", async () => {
  const card = await readFile(cardPath, "utf8");
  const scoreBreakdown = card.slice(
    card.indexOf("function ScoreBreakdownBar"),
    card.indexOf("interface RecommendationCardProps")
  );

  // Two-column: photo left, chips/date/%/CTA in the right column (not full-bleed above).
  assert.match(
    card,
    /relative h-20 w-20[\s\S]*aria-label="거리·시간"[\s\S]*item\.displayMatchPercent[\s\S]*지도에서 보기/
  );
  assert.match(card, /items-stretch/);
  assert.match(card, /mt-auto[\s\S]*지도에서 보기/);
  assert.match(card, /item\.contextChips\.map/);
  assert.match(card, /variant="caption"[\s\S]*text-xs[\s\S]*\{occurredAt\}/);
  assert.doesNotMatch(card, />\s*추천 점수\s*</);
  assert.match(
    card,
    /aria-label=\{`추천 점수 \$\{item\.displayMatchPercent\}점`\}/
  );
  assert.match(card, /items-center gap-1\.5/);
  assert.match(card, /rounded-full border border-current/);
  assert.match(card, /h-3\.5 w-3\.5/);
  assert.doesNotMatch(card, /variant="title"[\s\S]*\{item\.matchPercent\}%/);
  assert.doesNotMatch(
    card,
    /className="[^"]*text-2xl[^"]*"[\s\S]{0,120}\{item\.matchPercent\}%/
  );
  assert.match(card, /aria-label="추천 점수 안내"/);
  assert.match(card, /h-5 w-5 text-yellow-500/);
  assert.match(
    card,
    /추천 점수는 후보 비교를 위한 참고 지표이며, 동일한 동물임을 보장하지 않습니다\./
  );
  assert.match(card, /role="tooltip"/);
  assert.match(card, /import \{ createPortal \} from "react-dom"/);
  assert.match(card, /createPortal\(/);
  assert.match(card, /document\.body/);
  assert.match(card, /fixed z-\[130\]/);
  assert.match(card, /getBoundingClientRect\(\)/);
  assert.doesNotMatch(card, /absolute top-full right-0 z-20[^]*role="tooltip"/);
  assert.match(card, /function ScoreBreakdownBar/);
  assert.match(
    card,
    /aria-label="추천 점수 구성: 위치와 시간, 외형 특징, 특이사항"/
  );
  assert.doesNotMatch(card, /현재 이동 가능 반경 약/);
  assert.match(card, /위치·시간/);
  assert.match(card, /외형 특징/);
  assert.match(card, /특이사항/);
  assert.match(card, /item\.scoreGroups/);
  assert.match(card, /MIN_SCORE_SEGMENT_PERCENT/);
  assert.match(card, /displayPercent/);
  assert.match(card, /width: `\$\{segment\.displayPercent\}%`/);
  assert.match(card, /유실·목격 시각 차이와 목격 위치까지의 거리/);
  assert.match(card, /종, 크기, 색상·무늬의 유사도/);
  assert.doesNotMatch(scoreBreakdown, /aria-expanded/);
  assert.doesNotMatch(scoreBreakdown, /onClick/);

  assert.match(card, /지도에서 보기/);
  assert.match(
    card,
    /import \{\s*buildRecommendationMapHref\s*\} from "@\/features\/map\/lib\/map-deep-link-focus";/
  );
  assert.match(
    card,
    /const mapHref = buildRecommendationMapHref\(\s*item\.sightingId,\s*lostPostId,\s*\{\s*lat: item\.lat,\s*lng: item\.lng,\s*\}\s*\);/
  );
  assert.match(card, /router\.push\(mapHref\)/);

  // 카드가 이미 받은 approximate 좌표는 인증 상세 조회 실패 시 지도 중심 fallback으로만 사용한다.
  assert.match(card, /item\.lat/);
  assert.match(card, /item\.lng/);

  assert.match(card, /북마크 등록/);
  assert.doesNotMatch(card, /상세 보기/);
  assert.doesNotMatch(card, /item\.matchSummary/);
  assert.doesNotMatch(card, /RECOMMENDATION_PRIORITY_LABELS/);
  assert.doesNotMatch(card, /유력/);
  assert.doesNotMatch(card, /openModal|SightingDetailCard|ReportBlockSheet/);
  assert.doesNotMatch(
    card,
    /item\.similarity|toFixed\(1\)|AI confidence|범위 안 제보|먼저 확인|함께 확인/
  );
  assert.doesNotMatch(card, /item\.evidence/);
});
