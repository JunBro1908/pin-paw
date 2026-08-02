import assert from "node:assert/strict";
import test from "node:test";

import { toRecommendationPresentation } from "../../src/features/recommendations/lib/recommendation-presentation.ts";
import { RECOMMENDATION_PRIORITY_LABELS } from "../../src/features/recommendations/model/types.ts";

test("maps each public priority to the approved Korean label", () => {
  assert.deepEqual(RECOMMENDATION_PRIORITY_LABELS, {
    high: "먼저 확인",
    medium: "함께 확인",
    "within-range": "범위 안 제보",
  });
});

test("maps high-priority recommendations to evidence without exposing the score", () => {
  const result = toRecommendationPresentation({
    similarity: 0.76,
    distanceKm: 1.4,
    timeDeltaHours: 5.2,
    matchedTraits: ["color", "distinctive_trait"],
  });

  assert.deepEqual(result, {
    priority: "high",
    distanceKm: 1.4,
    timeDeltaHours: 5.2,
    evidence: ["1.4km 거리", "약 5시간 뒤 목격", "색상 일치", "특이사항 일치"],
  });
  assert.equal("similarity" in result, false);
  assert.equal("matchedTraits" in result, false);
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

  assert.deepEqual(result.evidence, ["0.3km 거리", "1시간 이내 목격"]);
});

test("keeps only unique known traits in a deterministic evidence order", () => {
  const result = toRecommendationPresentation({
    similarity: 0.5,
    distanceKm: 2,
    timeDeltaHours: 2,
    matchedTraits: [
      "distinctive_trait",
      "unknown",
      "color",
      "color",
      "species",
      "size",
    ],
  });

  assert.deepEqual(result.evidence, [
    "2km 거리",
    "약 2시간 뒤 목격",
    "종 일치",
    "체형 일치",
    "색상 일치",
    "특이사항 일치",
  ]);
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
    distanceKm: 0,
    timeDeltaHours: 0,
    evidence: ["근처 목격", "1시간 이내 목격", "색상 일치"],
  });
});
