"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { MySightingItem } from "../model/types";
import {
  createAuthenticatedListCache,
  fetchAuthenticatedJsonList,
} from "@/shared/lib/client-resource-cache";
import {
  getAuthenticatedListView,
  type AuthenticatedListSnapshot,
} from "@/shared/lib/authenticated-list";

const SIGHTINGS_TTL_MS = 2 * 60 * 1000;

export const mySightingsCache = createAuthenticatedListCache<MySightingItem>({
  key: "my-sightings",
  ttlMs: SIGHTINGS_TTL_MS,
  fetcher: (accessToken) =>
    fetchAuthenticatedJsonList<MySightingItem>(
      "/api/v1/me/sightings?limit=50",
      accessToken
    ),
});

export function invalidateMySightingsCache() {
  mySightingsCache.invalidate();
}

export function prefetchMySightings(accessToken: string) {
  return mySightingsCache.load(accessToken).catch(() => undefined);
}

export function useMySightings(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const cacheVersion = useSyncExternalStore(
    mySightingsCache.subscribe,
    () => mySightingsCache.getVersion(),
    () => 0
  );
  const [snapshot, setSnapshot] =
    useState<AuthenticatedListSnapshot<MySightingItem> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(
    async (force = false) => {
      if (!accessToken || !enabled) return;
      const stale = mySightingsCache.peek(accessToken);
      if (stale) {
        setSnapshot({ accessToken, items: stale, error: null });
      }
      if (!force && mySightingsCache.isFresh(accessToken)) {
        setRefreshing(false);
        return;
      }
      setRefreshing(true);
      try {
        const items = await mySightingsCache.load(accessToken, { force });
        setSnapshot({ accessToken, items, error: null });
      } catch (error) {
        setSnapshot({
          accessToken,
          items: stale ?? [],
          error: error instanceof Error ? error.message : "오류",
        });
      } finally {
        setRefreshing(false);
      }
    },
    [accessToken, enabled]
  );

  useEffect(() => {
    if (!enabled || !accessToken) {
      setSnapshot(null);
      setRefreshing(false);
      return;
    }
    void reload(false);
  }, [accessToken, enabled, reload, cacheVersion]);

  const view = getAuthenticatedListView(accessToken, snapshot);
  const staleItems =
    accessToken && view.loading
      ? (mySightingsCache.peek(accessToken) ?? null)
      : null;

  return {
    items: staleItems ?? view.items,
    loading: view.loading && !staleItems,
    refreshing: refreshing || (view.loading && Boolean(staleItems)),
    error: view.error,
    reload: () => reload(true),
  };
}
