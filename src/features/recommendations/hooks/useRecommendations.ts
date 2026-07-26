"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { RecommendationsData } from "../model/types";

export interface RecommendationParams {
  radiusKm?: number;
  days?: number;
  topK?: number;
}

interface UseRecommendationsResult {
  data: RecommendationsData | null;
  error: Error | null;
  isLoading: boolean;
  mutate: () => void;
}

const DEFAULT_RADIUS_KM = 8;
const DEFAULT_DAYS = 8;
const DEFAULT_TOP_K = 10;

function buildRecommendationsUrl(
  lostPostId: string,
  params?: RecommendationParams | null
): string {
  const radiusKm = params?.radiusKm ?? DEFAULT_RADIUS_KM;
  const days = params?.days ?? DEFAULT_DAYS;
  const topK = params?.topK ?? DEFAULT_TOP_K;
  const search = new URLSearchParams({
    lostPostId,
    radiusKm: String(radiusKm),
    days: String(days),
    topK: String(topK),
  });
  return `/api/v1/recommendations?${search.toString()}`;
}

export function useRecommendations(
  lostPostId: string | null,
  accessToken: string | undefined,
  params?: RecommendationParams | null
): UseRecommendationsResult {
  const [data, setData] = useState<RecommendationsData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const radiusKm = params?.radiusKm;
  const days = params?.days;
  const topK = params?.topK;

  const fetchRecommendations = useCallback(() => {
    if (!lostPostId || !accessToken) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    const url = buildRecommendationsUrl(lostPostId, {
      radiusKm,
      days,
      topK,
    });
    fetch(url, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
    })
      .then((res) => res.json())
      .then((json) => {
        if (json.success && json.data) {
          setData(json.data as RecommendationsData);
        } else {
          setError(
            new Error(json?.error?.message ?? "추천을 불러올 수 없습니다.")
          );
        }
      })
      .catch((err) => {
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
      })
      .finally(() => setIsLoading(false));
  }, [lostPostId, accessToken, radiusKm, days, topK]);

  const fetchRef = useRef(fetchRecommendations);

  useEffect(() => {
    fetchRef.current = fetchRecommendations;
  }, [fetchRecommendations]);

  useEffect(() => {
    fetchRef.current();
  }, [lostPostId, accessToken]);

  return { data, error, isLoading, mutate: fetchRecommendations };
}
