export type RecommendationPriority = "high" | "medium" | "within-range";

/** Soft band labels — matchPercent is the primary signal on the card. */
export const RECOMMENDATION_PRIORITY_LABELS = {
  high: "유력",
  medium: "후보",
  "within-range": "참고",
} as const satisfies Record<RecommendationPriority, string>;

export interface RecommendationScoreBreakdown {
  movement: number;
  species: number;
  size: number;
  color: number;
  distinctiveTrait: number;
  movementRadiusKm?: number;
}

export interface RecommendationItem {
  sightingId: string;
  photoKeys: string[];
  occurredAt: string;
  lat: number;
  lng: number;
  locationPrecision: "approximate";
  /** 7-5: 내 강아지로 인정한 제보 여부 (추천 최상단 고정) */
  claimedAsMyDog?: boolean;
  priority: RecommendationPriority;
  /** Rounded 0–100 from internal similarity; raw score key stays private. */
  matchPercent: number;
  /** One-line trait match summary (종·색·크기 등). */
  matchSummary: string;
  distanceKm: number;
  timeDeltaHours: number;
  /** Distance + time chips only (traits live in matchSummary). */
  contextChips: string[];
  /** Final-score contributions, each expressed on the same 0–1 scale as matchPercent. */
  scoreBreakdown: RecommendationScoreBreakdown;
}

export interface RecommendationsData {
  status: "pending" | "ready";
  items: RecommendationItem[];
  calculatedAt?: string;
}
