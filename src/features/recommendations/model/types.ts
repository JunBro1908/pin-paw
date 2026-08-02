export type RecommendationPriority = "high" | "medium" | "within-range";

export const RECOMMENDATION_PRIORITY_LABELS = {
  high: "먼저 확인",
  medium: "함께 확인",
  "within-range": "범위 안 제보",
} as const satisfies Record<RecommendationPriority, string>;

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
  distanceKm: number;
  timeDeltaHours: number;
  evidence: string[];
}

export interface RecommendationsData {
  status: "pending" | "ready";
  items: RecommendationItem[];
  calculatedAt?: string;
}
