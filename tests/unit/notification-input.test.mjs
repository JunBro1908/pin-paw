import assert from "node:assert/strict";
import test from "node:test";

const { parseNotificationPreferences } =
  await import("../../src/shared/lib/notification-input.ts");

test("accepts a complete strict notification preference update", () => {
  assert.deepEqual(
    parseNotificationPreferences({
      newRecommendationEnabled: false,
      claimUpdatesEnabled: true,
      lostPostStatusEnabled: false,
      analyticsOptIn: true,
    }),
    {
      ok: true,
      value: {
        newRecommendationEnabled: false,
        claimUpdatesEnabled: true,
        lostPostStatusEnabled: false,
        analyticsOptIn: true,
      },
    }
  );
});

test("rejects partial, non-boolean, and unknown preference fields", () => {
  for (const input of [
    { newRecommendationEnabled: true },
    {
      newRecommendationEnabled: true,
      claimUpdatesEnabled: "true",
      lostPostStatusEnabled: true,
      analyticsOptIn: true,
    },
    {
      newRecommendationEnabled: true,
      claimUpdatesEnabled: true,
      lostPostStatusEnabled: true,
      analyticsOptIn: true,
      token: "forbidden",
    },
    {
      newRecommendationEnabled: true,
      claimUpdatesEnabled: true,
      lostPostStatusEnabled: true,
    },
  ]) {
    assert.equal(parseNotificationPreferences(input).ok, false);
  }
});
