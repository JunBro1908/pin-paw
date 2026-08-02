import {
  buildMapCacheKey,
  DEFAULT_MAP_CENTER,
  DEFAULT_MAP_WARM_HALF_SPAN,
  DEFAULT_MAP_WARM_ZOOM,
} from "./map-domain";
import type { MapViewport } from "./map-domain";
import type { MapItem } from "../types/naver";
import { getCachedUserMapCenter } from "./map-user-center-cache";

export type MapViewportCacheEntry = {
  etag: string;
  items: MapItem[];
};

const viewportCache = new Map<string, MapViewportCacheEntry>();
const inFlightPrefetch = new Map<string, Promise<void>>();

export function getDefaultAuthMapViewport(): {
  viewport: MapViewport;
  zoom: number;
} {
  const center = getCachedUserMapCenter() ?? DEFAULT_MAP_CENTER;
  const { lat, lng } = center;
  const half = DEFAULT_MAP_WARM_HALF_SPAN;
  return {
    zoom: DEFAULT_MAP_WARM_ZOOM,
    viewport: {
      minLat: lat - half,
      minLng: lng - half,
      maxLat: lat + half,
      maxLng: lng + half,
    },
  };
}

export function getDefaultAuthMapCacheKey(): string {
  const { viewport, zoom } = getDefaultAuthMapViewport();
  return buildMapCacheKey(viewport, zoom, true, "default");
}

export function getMapViewportCache(
  cacheKey: string
): MapViewportCacheEntry | undefined {
  return viewportCache.get(cacheKey);
}

export function setMapViewportCache(
  cacheKey: string,
  entry: MapViewportCacheEntry
): void {
  viewportCache.set(cacheKey, {
    etag: entry.etag,
    items: entry.items,
  });
}

export function clearMapViewportCache(): void {
  viewportCache.clear();
  inFlightPrefetch.clear();
}

/**
 * Warm markers around the cached user center (or Seoul fallback) so the map
 * tab can paint immediately and revalidate with If-None-Match.
 */
export function prefetchAuthMapViewport(accessToken: string): Promise<void> {
  if (!accessToken) return Promise.resolve();

  const { viewport, zoom } = getDefaultAuthMapViewport();
  const cacheKey = buildMapCacheKey(viewport, zoom, true, "default");
  const existing = inFlightPrefetch.get(cacheKey);
  if (existing) return existing;

  const task = (async () => {
    const params = new URLSearchParams({
      minLat: String(viewport.minLat),
      minLng: String(viewport.minLng),
      maxLat: String(viewport.maxLat),
      maxLng: String(viewport.maxLng),
      zoom: String(zoom),
    });
    const cached = viewportCache.get(cacheKey);
    const headers: Record<string, string> = {
      Authorization: `Bearer ${accessToken}`,
    };
    if (cached?.etag) headers["If-None-Match"] = cached.etag;

    const response = await fetch(`/api/v1/auth/map/markers?${params}`, {
      credentials: "include",
      headers,
    });

    if (response.status === 304) return;
    if (!response.ok) {
      throw new Error(`Map prefetch failed: ${response.status}`);
    }

    const result = (await response.json()) as {
      success?: boolean;
      data?: { clusters?: MapItem[] };
    };
    if (!result.success || !result.data?.clusters) {
      throw new Error("Map prefetch response was unsuccessful");
    }

    setMapViewportCache(cacheKey, {
      etag: response.headers.get("ETag") ?? "",
      items: result.data.clusters,
    });
  })().finally(() => {
    inFlightPrefetch.delete(cacheKey);
  });

  inFlightPrefetch.set(cacheKey, task);
  return task.then(
    () => undefined,
    () => undefined
  );
}
