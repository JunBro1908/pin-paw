"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import type { RecommendationsData } from "../model/types";
import { createRecommendationRequestGuard } from "../lib/recommendation-interaction";

export interface RecommendationParams {
  radiusKm?: number;
  days?: number;
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
  const search = new URLSearchParams({
    lostPostId,
    radiusKm: String(radiusKm),
    days: String(days),
    topK: String(DEFAULT_TOP_K),
  });
  return `/api/v1/recommendations?${search.toString()}`;
}

function buildRequestKey(
  lostPostId: string,
  radiusKm: number | undefined,
  days: number | undefined
): string {
  return `${lostPostId}:${radiusKm ?? DEFAULT_RADIUS_KM}:${days ?? DEFAULT_DAYS}`;
}

export function useRecommendations(
  lostPostId: string | null,
  accessToken: string | undefined,
  params?: RecommendationParams | null
): UseRecommendationsResult {
  const radiusKm = params?.radiusKm;
  const days = params?.days;
  const canFetch = Boolean(lostPostId && accessToken);
  const baseKey = canFetch
    ? buildRequestKey(lostPostId as string, radiusKm, days)
    : null;
  const [data, setData] = useState<RecommendationsData | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [resolvedKey, setResolvedKey] = useState<string | null>(null);
  const [refreshNonce, setRefreshNonce] = useState(0);
  const requestKey = baseKey ? `${baseKey}#${refreshNonce}` : null;
  const guardRef = useRef(createRecommendationRequestGuard());
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    abortRef.current?.abort();
    abortRef.current = null;

    if (!lostPostId || !accessToken || !requestKey) {
      guardRef.current.invalidate();
      return;
    }

    const guard = guardRef.current;
    const requestOwner = guard.begin(requestKey);
    const state = requestOwner;
    const controller = new AbortController();
    abortRef.current = controller;

    const url = buildRecommendationsUrl(lostPostId, {
      radiusKm,
      days,
    });

    fetch(url, {
      credentials: "include",
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: controller.signal,
    })
      .then((res) => res.json())
      .then((json) => {
        if (!(guard.isCurrent(requestOwner) && state.key === requestKey)) {
          return;
        }
        if (json.success && json.data) {
          setData(json.data as RecommendationsData);
          setError(null);
        } else {
          setError(
            new Error(json?.error?.message ?? "추천을 불러올 수 없습니다.")
          );
          setData(null);
        }
        setResolvedKey(requestKey);
      })
      .catch((err) => {
        if (controller.signal.aborted) return;
        if (!(guard.isCurrent(requestOwner) && state.key === requestKey)) {
          return;
        }
        setError(err instanceof Error ? err : new Error(String(err)));
        setData(null);
        setResolvedKey(requestKey);
      });

    return () => {
      controller.abort();
      abortRef.current = null;
      guard.invalidate();
    };
  }, [lostPostId, accessToken, radiusKm, days, requestKey]);

  const mutate = useCallback(() => {
    setRefreshNonce((value) => value + 1);
  }, []);

  if (!canFetch) {
    return { data: null, error: null, isLoading: false, mutate };
  }

  const isLoading = resolvedKey !== requestKey;
  return {
    data,
    error: isLoading ? null : error,
    isLoading,
    mutate,
  };
}
