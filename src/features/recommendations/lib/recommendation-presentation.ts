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
  distanceKm: number;
  timeDeltaHours: number;
  evidence: string[];
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

function toPriority(similarity: number): RecommendationPriority {
  if (similarity >= 0.72) return "high";
  if (similarity >= 0.45) return "medium";
  return "within-range";
}

function isKnownTrait(trait: string): trait is KnownTrait {
  return Object.hasOwn(TRAIT_LABELS, trait);
}

export function toRecommendationPresentation(
  raw: RawRecommendationEvidence
): RecommendationPresentation {
  const similarity = sanitizeSimilarity(raw.similarity);
  const distanceKm = sanitizeNonNegative(raw.distanceKm);
  const timeDeltaHours = sanitizeNonNegative(raw.timeDeltaHours);
  const matchedTraitSet = new Set(
    (Array.isArray(raw.matchedTraits) ? raw.matchedTraits : []).filter(
      isKnownTrait
    )
  );
  const timeEvidence =
    timeDeltaHours < 1
      ? "1시간 이내 목격"
      : `약 ${Math.round(timeDeltaHours)}시간 뒤 목격`;
  const traitEvidence = (Object.keys(TRAIT_LABELS) as KnownTrait[])
    .filter((trait) => matchedTraitSet.has(trait))
    .map((trait) => `${TRAIT_LABELS[trait]} 일치`);

  return {
    priority: toPriority(similarity),
    distanceKm,
    timeDeltaHours,
    evidence: [`${distanceKm}km 거리`, timeEvidence, ...traitEvidence],
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
    distanceKm: presentation.distanceKm,
    timeDeltaHours: presentation.timeDeltaHours,
    evidence: presentation.evidence,
  };
}
