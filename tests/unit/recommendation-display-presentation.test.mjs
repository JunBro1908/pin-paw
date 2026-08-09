import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import {
  groupRecommendationScoreBreakdown,
  toDisplayMatchPercent,
} from "../../src/features/recommendations/lib/recommendation-presentation.ts";

test("display match percent expands a stable raw-score spread without candidate normalization", () => {
  assert.equal(toDisplayMatchPercent(0.8), 100);
  assert.equal(toDisplayMatchPercent(0.7), 89);
  assert.equal(toDisplayMatchPercent(0.6), 78);
  assert.equal(toDisplayMatchPercent(0.5), 67);
  assert.equal(toDisplayMatchPercent(0.45), 62);
  assert.equal(toDisplayMatchPercent(Number.NaN), 0);
  assert.equal(toDisplayMatchPercent(Number.POSITIVE_INFINITY), 0);
});

test("recommendation score breakdown groups raw contributions without rescaling them", () => {
  assert.deepEqual(
    groupRecommendationScoreBreakdown({
      movement: 0.39,
      species: 0.15,
      size: 0.1,
      color: 0.13,
      distinctiveTrait: 0.05,
      movementRadiusKm: 4.6,
    }),
    {
      locationTime: 0.39,
      appearance: 0.38,
      distinctive: 0.05,
      movementRadiusKm: 4.6,
      appearanceDetail: {
        species: 0.15,
        size: 0.1,
        color: 0.13,
      },
    }
  );
});

test("recommendation card presents a static score breakdown without model-only copy", async () => {
  const source = await readFile(
    "src/features/recommendations/components/RecommendationCard.tsx",
    "utf8"
  );
  const scoreBar = source.slice(
    source.indexOf("function ScoreBreakdownBar"),
    source.indexOf("interface RecommendationCardProps")
  );

  assert.match(source, /추천 점수/);
  assert.match(source, /\{item\.displayMatchPercent\}점/);
  assert.doesNotMatch(source, /후보 적합도/);
  assert.doesNotMatch(scoreBar, /movementRadiusKm|현재 이동 가능 반경/);
  assert.doesNotMatch(scoreBar, /useState|setExpanded|aria-expanded/);
  assert.doesNotMatch(scoreBar, /<button|type="button"/);
  assert.match(scoreBar, /role="progressbar"/);
  assert.match(scoreBar, /h-5 overflow-hidden/);
  assert.match(scoreBar, /MIN_SCORE_SEGMENT_PERCENT/);
  assert.match(scoreBar, /const totalPercent/);
  assert.match(scoreBar, /const displayPercent/);
  assert.match(
    scoreBar,
    /style=\{\{ width: `\$\{segment\.displayPercent\}%` \}\}/
  );
  assert.doesNotMatch(scoreBar, /aria-label="점수 상세"/);
});
