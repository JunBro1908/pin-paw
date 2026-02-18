export interface RecommendationItem {
  sightingId: string;
  similarity: number;
  photoKeys: string[];
  occurredAt: string;
  lat: number;
  lng: number;
  /** 7-5: 내 강아지로 인정한 제보 여부 (추천 최상단 고정) */
  claimedAsMyDog?: boolean;
}

export interface RecommendationsData {
  status: "pending" | "ready";
  items: RecommendationItem[];
  calculatedAt?: string;
}
