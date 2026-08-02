import type {
  RecommendationItem,
  RecommendationPriority,
} from "../model/types";

const TRAIT_LABELS = {
  species: "종",
  size: "체형",
  color: "색상",
  distinctive_trait: "특이사항",
} as const;

type KnownTrait = keyof typeof TRAIT_LABELS;

export interface RawRecommendationEvidence {
  similarity: number;
  distanceKm: number;
  timeDeltaHours: number;
  matchedTraits: readonly string[];
}

export interface RecommendationPresentation {
  priority: RecommendationPriority;
  matchPercent: number;
  matchSummary: string;
  distanceKm: number;
  timeDeltaHours: number;
  contextChips: string[];
}

export type ProtectedRawRecommendationItem = RawRecommendationEvidence & {
  sightingId: string;
  photoKeys: string[];
  occurredAt: string;
  lat: number;
  lng: number;
  locationPrecision: "approximate";
  claimedAsMyDog?: boolean;
};

function sanitizeNonNegative(value: number): number {
  return Number.isFinite(value) && value > 0 ? value : 0;
}

function sanitizeSimilarity(value: number): number {
  return Math.min(sanitizeNonNegative(value), 1);
}

export function toMatchPercent(similarity: number): number {
  return Math.round(sanitizeSimilarity(similarity) * 100);
}

function toPriority(similarity: number): RecommendationPriority {
  if (similarity >= 0.72) return "high";
  if (similarity >= 0.45) return "medium";
  return "within-range";
}

function isKnownTrait(trait: string): trait is KnownTrait {
  return Object.hasOwn(TRAIT_LABELS, trait);
}

function knownTraitsInOrder(
  matchedTraits: readonly string[]
): KnownTrait[] {
  const matchedTraitSet = new Set(
    (Array.isArray(matchedTraits) ? matchedTraits : []).filter(isKnownTrait)
  );
  return (Object.keys(TRAIT_LABELS) as KnownTrait[]).filter((trait) =>
    matchedTraitSet.has(trait)
  );
}

export function buildMatchSummary(matchedTraits: readonly string[]): string {
  const traits = knownTraitsInOrder(matchedTraits);
  if (traits.length === 0) {
    return "거리·시간 기준으로 모아 둔 제보";
  }
  const labels = traits.map((trait) => TRAIT_LABELS[trait]);
  if (labels.length === 1) return `${labels[0]} 일치`;
  if (labels.length === 2) return `${labels[0]}·${labels[1]} 일치`;
  return `${labels.slice(0, -1).join("·")}·${labels[labels.length - 1]} 일치`;
}

function buildContextChips(
  distanceKm: number,
  timeDeltaHours: number
): string[] {
  const timeEvidence =
    timeDeltaHours < 1
      ? "1시간 이내 목격"
      : `약 ${Math.round(timeDeltaHours)}시간 뒤 목격`;
  const distanceEvidence =
    distanceKm > 0 ? `${distanceKm}km 거리` : "근처 목격";
  return [distanceEvidence, timeEvidence];
}

/**
 * Review order after RPC (similarity desc):
 * 1) claimed bookmarks stay pinned
 * 2) nearer distance bands first
 * 3) higher matchPercent within a band
 * 4) sooner time delta as tie-break
 */
export function distanceBand(distanceKm: number): number {
  const km = sanitizeNonNegative(distanceKm);
  if (km <= 1) return 0;
  if (km <= 3) return 1;
  if (km <= 8) return 2;
  return 3;
}

export function sortRecommendationsForReview<
  T extends {
    claimedAsMyDog?: boolean;
    distanceKm: number;
    similarity?: number;
    matchPercent?: number;
    timeDeltaHours: number;
  },
>(items: readonly T[]): T[] {
  return items.toSorted((a, b) => {
    const claim =
      Number(Boolean(b.claimedAsMyDog)) - Number(Boolean(a.claimedAsMyDog));
    if (claim !== 0) return claim;

    const band = distanceBand(a.distanceKm) - distanceBand(b.distanceKm);
    if (band !== 0) return band;

    const aPercent =
      typeof a.matchPercent === "number"
        ? a.matchPercent
        : toMatchPercent(a.similarity ?? 0);
    const bPercent =
      typeof b.matchPercent === "number"
        ? b.matchPercent
        : toMatchPercent(b.similarity ?? 0);
    if (bPercent !== aPercent) return bPercent - aPercent;

    return (
      sanitizeNonNegative(a.timeDeltaHours) -
      sanitizeNonNegative(b.timeDeltaHours)
    );
  });
}

export function toRecommendationPresentation(
  raw: RawRecommendationEvidence
): RecommendationPresentation {
  const similarity = sanitizeSimilarity(raw.similarity);
  const distanceKm = sanitizeNonNegative(raw.distanceKm);
  const timeDeltaHours = sanitizeNonNegative(raw.timeDeltaHours);

  return {
    priority: toPriority(similarity),
    matchPercent: toMatchPercent(similarity),
    matchSummary: buildMatchSummary(raw.matchedTraits),
    distanceKm,
    timeDeltaHours,
    contextChips: buildContextChips(distanceKm, timeDeltaHours),
  };
}

export function toPublicRecommendationItem(
  raw: ProtectedRawRecommendationItem
): RecommendationItem {
  const presentation = toRecommendationPresentation({
    similarity: raw.similarity,
    matchedTraits: raw.matchedTraits,
    distanceKm: raw.distanceKm,
    timeDeltaHours: raw.timeDeltaHours,
  });

  return {
    sightingId: raw.sightingId,
    photoKeys: raw.photoKeys,
    occurredAt: raw.occurredAt,
    lat: raw.lat,
    lng: raw.lng,
    locationPrecision: raw.locationPrecision,
    claimedAsMyDog: raw.claimedAsMyDog,
    priority: presentation.priority,
    matchPercent: presentation.matchPercent,
    matchSummary: presentation.matchSummary,
    distanceKm: presentation.distanceKm,
    timeDeltaHours: presentation.timeDeltaHours,
    contextChips: presentation.contextChips,
  };
}
