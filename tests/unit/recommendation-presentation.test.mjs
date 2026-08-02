import assert from "node:assert/strict";
import test from "node:test";

import {
  buildMatchSummary,
  sortRecommendationsForReview,
  toMatchPercent,
  toRecommendationPresentation,
} from "../../src/features/recommendations/lib/recommendation-presentation.ts";
import { RECOMMENDATION_PRIORITY_LABELS } from "../../src/features/recommendations/model/types.ts";

test("maps each public priority to an intuitive Korean band label", () => {
  assert.deepEqual(RECOMMENDATION_PRIORITY_LABELS, {
    high: "유력",
    medium: "후보",
    "within-range": "참고",
  });
  assert.equal(
    Object.values(RECOMMENDATION_PRIORITY_LABELS).includes("범위 안 제보"),
    false
  );
  assert.equal(
    Object.values(RECOMMENDATION_PRIORITY_LABELS).includes("먼저 확인"),
    false
  );
});

test("exposes matchPercent and trait summary without raw similarity keys", () => {
  const result = toRecommendationPresentation({
    similarity: 0.76,
    distanceKm: 1.4,
    timeDeltaHours: 5.2,
    matchedTraits: ["color", "distinctive_trait"],
  });

  assert.deepEqual(result, {
    priority: "high",
    matchPercent: 76,
    matchSummary: "색상·특이사항 일치",
    distanceKm: 1.4,
    timeDeltaHours: 5.2,
    contextChips: ["1.4km 거리", "약 5시간 뒤 목격"],
  });
  assert.equal("similarity" in result, false);
  assert.equal("matchedTraits" in result, false);
  assert.equal("evidence" in result, false);
});

test("uses the exact score boundaries for high and medium priority", () => {
  assert.equal(
    toRecommendationPresentation({
      similarity: 0.72,
      distanceKm: 0,
      timeDeltaHours: 1,
      matchedTraits: [],
    }).priority,
    "high"
  );
  assert.equal(toMatchPercent(0.72), 72);
  assert.equal(
    toRecommendationPresentation({
      similarity: 0.45,
      distanceKm: 0,
      timeDeltaHours: 1,
      matchedTraits: [],
    }).priority,
    "medium"
  );
  assert.equal(
    toRecommendationPresentation({
      similarity: 0.4499,
      distanceKm: 0,
      timeDeltaHours: 1,
      matchedTraits: [],
    }).priority,
    "within-range"
  );
});

test("describes sightings under one hour without rounding them to zero", () => {
  const result = toRecommendationPresentation({
    similarity: 0.5,
    distanceKm: 0.3,
    timeDeltaHours: 0.49,
    matchedTraits: [],
  });

  assert.deepEqual(result.contextChips, ["0.3km 거리", "1시간 이내 목격"]);
  assert.equal(result.matchSummary, "거리·시간 기준으로 모아 둔 제보");
});

test("keeps only unique known traits in a deterministic summary order", () => {
  const summary = buildMatchSummary([
    "distinctive_trait",
    "unknown",
    "color",
    "color",
    "species",
    "size",
  ]);

  assert.equal(summary, "종·체형·색상·특이사항 일치");
});

test("sanitizes non-finite and negative numeric evidence inputs", () => {
  const result = toRecommendationPresentation({
    similarity: Number.POSITIVE_INFINITY,
    distanceKm: -3,
    timeDeltaHours: Number.NaN,
    matchedTraits: ["color"],
  });

  assert.deepEqual(result, {
    priority: "within-range",
    matchPercent: 0,
    matchSummary: "색상 일치",
    distanceKm: 0,
    timeDeltaHours: 0,
    contextChips: ["근처 목격", "1시간 이내 목격"],
  });
});

test("review sort pins claims then nearer bands then higher match percent", () => {
  const sorted = sortRecommendationsForReview([
    {
      id: "far-high",
      claimedAsMyDog: false,
      distanceKm: 9,
      similarity: 0.95,
      timeDeltaHours: 2,
    },
    {
      id: "near-low",
      claimedAsMyDog: false,
      distanceKm: 0.5,
      similarity: 0.4,
      timeDeltaHours: 10,
    },
    {
      id: "claimed",
      claimedAsMyDog: true,
      distanceKm: 12,
      similarity: 0.1,
      timeDeltaHours: 40,
    },
    {
      id: "near-high",
      claimedAsMyDog: false,
      distanceKm: 0.8,
      similarity: 0.7,
      timeDeltaHours: 3,
    },
  ]);

  assert.deepEqual(
    sorted.map((item) => item.id),
    ["claimed", "near-high", "near-low", "far-high"]
  );
});
