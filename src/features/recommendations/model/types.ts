export interface RecommendationItem {
  sightingId: string;
  similarity: number;
  photoKeys: string[];
  occurredAt: string;
  lat: number;
  lng: number;
}

export interface RecommendationsData {
  status: "pending" | "ready";
  items: RecommendationItem[];
  calculatedAt?: string;
}
