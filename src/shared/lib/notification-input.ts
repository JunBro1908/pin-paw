export interface NotificationPreferencesInput {
  newRecommendationEnabled: boolean;
  claimUpdatesEnabled: boolean;
  lostPostStatusEnabled: boolean;
  analyticsOptIn: boolean;
}

export function parseNotificationPreferences(
  value: unknown
):
  | { ok: true; value: NotificationPreferencesInput }
  | { ok: false; reason: string } {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    return { ok: false, reason: "invalid_body" };
  }

  const input = value as Record<string, unknown>;
  const allowed = new Set([
    "newRecommendationEnabled",
    "claimUpdatesEnabled",
    "lostPostStatusEnabled",
    "analyticsOptIn",
  ]);
  if (
    Object.keys(input).some((key) => !allowed.has(key)) ||
    typeof input.newRecommendationEnabled !== "boolean" ||
    typeof input.claimUpdatesEnabled !== "boolean" ||
    typeof input.lostPostStatusEnabled !== "boolean" ||
    typeof input.analyticsOptIn !== "boolean"
  ) {
    return { ok: false, reason: "invalid_preferences" };
  }

  return {
    ok: true,
    value: {
      newRecommendationEnabled: input.newRecommendationEnabled,
      claimUpdatesEnabled: input.claimUpdatesEnabled,
      lostPostStatusEnabled: input.lostPostStatusEnabled,
      analyticsOptIn: input.analyticsOptIn,
    },
  };
}
