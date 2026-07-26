import assert from "node:assert/strict";
import test from "node:test";

import {
  maskCoordinate,
  protectRecommendationLocations,
} from "../../src/shared/lib/privacy-location.ts";

test("maskCoordinate returns the stable center of a 0.05 degree grid", () => {
  assert.equal(maskCoordinate(37.5665), 37.575);
  assert.equal(maskCoordinate(126.978), 126.975);
  assert.equal(maskCoordinate(-0.001), -0.025);
});

test("recommendation protection never unlocks precision from a bookmark claim", () => {
  const [result] = protectRecommendationLocations([
    {
      sightingId: "8db61ddf-bce2-4b51-b531-0b93093053d1",
      similarity: 0.9,
      photoKeys: ["safe/example.webp"],
      occurredAt: "2026-07-25T00:00:00.000Z",
      lat: 37.5665,
      lng: 126.978,
      claimedAsMyDog: true,
    },
  ]);

  assert.equal(result.lat, 37.575);
  assert.equal(result.lng, 126.975);
  assert.equal(result.locationPrecision, "approximate");
  assert.equal(result.claimedAsMyDog, true);
});

test("recommendation protection rejects non-finite coordinates", () => {
  assert.throws(
    () =>
      protectRecommendationLocations([
        {
          sightingId: "8db61ddf-bce2-4b51-b531-0b93093053d1",
          similarity: 0.9,
          photoKeys: [],
          occurredAt: "2026-07-25T00:00:00.000Z",
          lat: Number.NaN,
          lng: 126.978,
        },
      ]),
    /finite/
  );
});
