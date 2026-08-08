/**
 * Production may still run the older get_recommendations_for_lost_post shape
 * (similarity + lat/lng only). Warm UX expects distanceKm / timeDeltaHours /
 * matchedTraits — fill those from coordinates and timestamps when missing.
 */

export interface SparseRecommendationItem {
  sightingId: string;
  similarity: number;
  photoKeys: string[];
  occurredAt: string;
  lat: number;
  lng: number;
  distanceKm?: number;
  timeDeltaHours?: number;
  matchedTraits?: string[];
  scoreBreakdown?: {
    movement?: number;
    species?: number;
    size?: number;
    color?: number;
    distinctiveTrait?: number;
    movementRadiusKm?: number;
  };
}

export interface LostPostEvidenceAnchor {
  lostAt: string | null;
  lat: number | null;
  lng: number | null;
}

const EARTH_RADIUS_KM = 6371;

export function haversineKm(
  lat1: number,
  lng1: number,
  lat2: number,
  lng2: number
): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function needsRecommendationEvidenceEnrichment(
  items: readonly SparseRecommendationItem[]
): boolean {
  return items.some(
    (item) =>
      typeof item.distanceKm !== "number" ||
      typeof item.timeDeltaHours !== "number" ||
      !Array.isArray(item.matchedTraits)
  );
}

export function enrichRecommendationEvidence(
  items: readonly SparseRecommendationItem[],
  anchor: LostPostEvidenceAnchor
): SparseRecommendationItem[] {
  const lostAtMs = anchor.lostAt ? Date.parse(anchor.lostAt) : Number.NaN;
  return items.map((item) => {
    const distanceKm =
      typeof item.distanceKm === "number" && Number.isFinite(item.distanceKm)
        ? item.distanceKm
        : anchor.lat != null &&
            anchor.lng != null &&
            Number.isFinite(item.lat) &&
            Number.isFinite(item.lng)
          ? Math.round(
              haversineKm(anchor.lat, anchor.lng, item.lat, item.lng) * 10
            ) / 10
          : 0;

    const occurredMs = Date.parse(item.occurredAt);
    const timeDeltaHours =
      typeof item.timeDeltaHours === "number" &&
      Number.isFinite(item.timeDeltaHours)
        ? item.timeDeltaHours
        : Number.isFinite(lostAtMs) && Number.isFinite(occurredMs)
          ? Math.max(
              0,
              Math.round(((occurredMs - lostAtMs) / 3_600_000) * 10) / 10
            )
          : 0;

    const matchedTraits = Array.isArray(item.matchedTraits)
      ? item.matchedTraits
      : [];

    return {
      ...item,
      distanceKm,
      timeDeltaHours,
      matchedTraits,
    };
  });
}
