"use client";

import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import {
  buildMapCacheKey,
  getFilteredItems,
  getRequestZoom,
  normalizeSightingId,
} from "../lib/map-domain";
import type {
  BookmarkPath,
  MapLayer,
  MapViewport,
  SightingFeedbackMap,
} from "../lib/map-domain";
import {
  createInitialMapDataState,
  getMapDataView,
  mapDataReducer,
} from "../lib/map-data-state";
import type { LostPostMapItem, MapDataState } from "../lib/map-data-state";
import { createLatestRequestGuard } from "../lib/map-request-guard";
import type { ClusterResponse, MapItem } from "../types/naver";

interface CacheValue {
  etag: string;
  items: MapItem[];
}

interface ApiResult<T> {
  success: boolean;
  data?: T;
}

interface FeedbackResponse {
  views?: Record<string, { seen: boolean }>;
}

interface ClaimResponse {
  sightingIds?: string[];
}

interface UseMapDataOptions {
  accessToken?: string;
  authLoading: boolean;
  layer: MapLayer;
  initialLostPostId?: string;
}

export interface UseMapDataResult extends MapDataState {
  loadViewport(viewport: MapViewport, zoom: number): Promise<void>;
  reloadBookmark(): Promise<void>;
  patchFeedback(
    sightingId: string,
    patch: { claimed?: boolean; seen?: boolean }
  ): void;
  reset(): void;
}

function getRequestErrorMessage(): string {
  return "지도 데이터를 불러오는 데 실패했습니다.";
}

async function readJson<T>(
  response: Response,
  signal: AbortSignal
): Promise<ApiResult<T>> {
  if (!response.ok) throw new Error(`Map request failed: ${response.status}`);
  const result = (await response.json()) as ApiResult<T>;
  if (signal.aborted) throw new DOMException("Aborted", "AbortError");
  return result;
}

export function useMapData({
  accessToken,
  authLoading,
  layer,
  initialLostPostId,
}: UseMapDataOptions): UseMapDataResult {
  const principalKey = accessToken ?? "anonymous";
  const [state, dispatch] = useReducer(
    mapDataReducer,
    undefined,
    createInitialMapDataState
  );
  const [requestGuard] = useState(createLatestRequestGuard);
  const cacheRef = useRef<Map<string, CacheValue>>(new Map());
  const view = getMapDataView(principalKey, state);

  useEffect(
    () => () => {
      requestGuard.dispose();
    },
    [requestGuard]
  );

  const loadViewport = useCallback(
    async (viewport: MapViewport, zoom: number) => {
      if (authLoading) return;

      const authenticated = Boolean(accessToken);
      const requestZoom = getRequestZoom(zoom, layer);
      const cacheKey = buildMapCacheKey(viewport, zoom, authenticated, layer);
      const ownerKey = `${principalKey}:${layer}:${cacheKey}`;
      const lease = requestGuard.begin(ownerKey);
      const cached = cacheRef.current.get(cacheKey);
      dispatch({ type: "begin", principalKey, ownerKey });

      const resolveItems = async (rawItems: MapItem[]) => {
        let feedback: SightingFeedbackMap = {};
        const pointIds = rawItems
          .filter(
            (item): item is MapItem & { type: "point"; id: string } =>
              item.type === "point" && typeof item.id === "string"
          )
          .map((item) => item.id);

        if (accessToken && pointIds.length > 0) {
          const claimsUrl = initialLostPostId
            ? `/api/v1/me/lost-posts/${encodeURIComponent(
                initialLostPostId
              )}/sighting-claims`
            : "/api/v1/me/sighting-claims";
          const headers = { Authorization: `Bearer ${accessToken}` };
          try {
            const [viewsResult, claimsResult] = await Promise.all([
              fetch(
                `/api/v1/me/sighting-views?sightingIds=${encodeURIComponent(
                  pointIds.join(",")
                )}`,
                {
                  credentials: "include",
                  headers,
                  signal: lease.signal,
                }
              ).then((response) =>
                readJson<FeedbackResponse>(response, lease.signal)
              ),
              fetch(claimsUrl, {
                credentials: "include",
                headers,
                signal: lease.signal,
              }).then((response) =>
                readJson<ClaimResponse>(response, lease.signal)
              ),
            ]);

            const views = viewsResult.data?.views ?? {};
            const claimedIds = new Set(
              (claimsResult.data?.sightingIds ?? []).map(normalizeSightingId)
            );
            feedback = Object.fromEntries(
              pointIds.map((id) => {
                const normalizedId = normalizeSightingId(id);
                const sightingView = views[id] ?? views[normalizedId];
                return [
                  normalizedId,
                  {
                    seen: sightingView?.seen ?? false,
                    claimed: claimedIds.has(normalizedId),
                  },
                ];
              })
            );
          } catch {
            // Feedback enrichment must not hide already-fetched map markers.
            feedback = {};
          }
        }

        if (!lease.isCurrent()) return;
        dispatch({
          type: "resolve-clusters",
          ownerKey,
          rawItems,
          items: getFilteredItems(rawItems, feedback, layer),
          feedback,
        });
      };

      try {
        if (cached) {
          await resolveItems(cached.items);
          if (!lease.isCurrent()) return;
        }

        const params = new URLSearchParams({
          minLat: String(viewport.minLat),
          minLng: String(viewport.minLng),
          maxLat: String(viewport.maxLat),
          maxLng: String(viewport.maxLng),
          zoom: String(requestZoom),
        });
        const headers: Record<string, string> = {};
        if (cached?.etag) headers["If-None-Match"] = cached.etag;
        const endpoint = authenticated
          ? "/api/v1/auth/map/markers"
          : "/api/v1/public/map/clusters";
        const response = await fetch(`${endpoint}?${params}`, {
          credentials: "include",
          headers,
          signal: lease.signal,
        });

        if (!lease.isCurrent() || response.status === 304) return;
        const result = await readJson<ClusterResponse>(response, lease.signal);
        if (!result.success || !result.data) {
          throw new Error("Map response was unsuccessful");
        }
        if (!lease.isCurrent()) return;

        const items = result.data.clusters;
        cacheRef.current.set(cacheKey, {
          etag: response.headers.get("ETag") ?? "",
          items,
        });
        await resolveItems(items);
      } catch {
        if (!lease.signal.aborted && lease.isCurrent()) {
          dispatch({
            type: "fail",
            ownerKey,
            error: getRequestErrorMessage(),
          });
        }
      } finally {
        lease.finish();
      }
    },
    [
      accessToken,
      authLoading,
      initialLostPostId,
      layer,
      principalKey,
      requestGuard,
    ]
  );

  const reloadBookmark = useCallback(async () => {
    if (!accessToken) return;

    const ownerKey = `${principalKey}:bookmark`;
    const lease = requestGuard.begin(ownerKey);
    const headers = { Authorization: `Bearer ${accessToken}` };
    dispatch({ type: "begin", principalKey, ownerKey });

    try {
      const [mapResult, pathsResult] = await Promise.all([
        fetch("/api/v1/me/lost-posts/map?limit=50", {
          credentials: "include",
          headers,
          signal: lease.signal,
        }).then((response) =>
          readJson<LostPostMapItem[]>(response, lease.signal)
        ),
        fetch("/api/v1/me/lost-posts/map/paths", {
          credentials: "include",
          headers,
          signal: lease.signal,
        }).then((response) => readJson<BookmarkPath[]>(response, lease.signal)),
      ]);

      if (!lease.isCurrent()) return;
      dispatch({
        type: "resolve-bookmark",
        ownerKey,
        lostPosts: Array.isArray(mapResult.data) ? mapResult.data : [],
        paths: Array.isArray(pathsResult.data) ? pathsResult.data : [],
      });
    } catch {
      if (!lease.signal.aborted && lease.isCurrent()) {
        dispatch({
          type: "fail",
          ownerKey,
          error: getRequestErrorMessage(),
        });
      }
    } finally {
      lease.finish();
    }
  }, [accessToken, principalKey, requestGuard]);

  const reset = useCallback(() => {
    requestGuard.dispose();
    dispatch({ type: "reset" });
  }, [requestGuard]);

  const patchFeedback = useCallback(
    (
      sightingId: string,
      patch: { claimed?: boolean; seen?: boolean }
    ) => {
      dispatch({
        type: "patch-feedback",
        sightingId,
        claimed: patch.claimed,
        seen: patch.seen,
      });
    },
    []
  );

  const filteredItems =
    layer === "bookmark"
      ? view.items
      : getFilteredItems(view.rawItems, view.feedback, layer);

  return {
    ...view,
    items: filteredItems,
    lostPosts: layer === "bookmark" ? view.lostPosts : [],
    paths: layer === "bookmark" ? view.paths : [],
    loadViewport,
    reloadBookmark,
    patchFeedback,
    reset,
  };
}
