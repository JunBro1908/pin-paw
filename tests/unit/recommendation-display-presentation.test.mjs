import assert from "node:assert/strict";
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
