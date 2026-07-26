"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { LostPostItem } from "../model/types";
import {
  createAuthenticatedListCache,
  fetchAuthenticatedJsonList,
} from "@/shared/lib/client-resource-cache";
import {
  getAuthenticatedListView,
  type AuthenticatedListSnapshot,
} from "@/shared/lib/authenticated-list";

const LOST_POSTS_TTL_MS = 5 * 60 * 1000;

export const myLostPostsCache = createAuthenticatedListCache<LostPostItem>({
  key: "my-lost-posts",
  ttlMs: LOST_POSTS_TTL_MS,
  fetcher: (accessToken) =>
    fetchAuthenticatedJsonList<LostPostItem>(
      "/api/v1/lost-posts?limit=50",
      accessToken
    ),
});

export function invalidateMyLostPostsCache() {
  myLostPostsCache.invalidate();
}

export function prefetchMyLostPosts(accessToken: string) {
  return myLostPostsCache.load(accessToken).catch(() => undefined);
}

export function useMyLostPosts(options?: { enabled?: boolean }) {
  const enabled = options?.enabled !== false;
  const { session } = useAuth();
  const accessToken = session?.access_token;
  const cacheVersion = useSyncExternalStore(
    myLostPostsCache.subscribe,
    () => myLostPostsCache.getVersion(),
    () => 0
  );
  const [snapshot, setSnapshot] =
    useState<AuthenticatedListSnapshot<LostPostItem> | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const reload = useCallback(
    async (force = false) => {
      if (!accessToken || !enabled) return;
      const stale = myLostPostsCache.peek(accessToken);
      if (stale) {
        setSnapshot({ accessToken, items: stale, error: null });
      }
      if (!force && myLostPostsCache.isFresh(accessToken)) {
        setRefreshing(false);
        return;
      }
      setRefreshing(true);
      try {
        const items = await myLostPostsCache.load(accessToken, { force });
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
      ? (myLostPostsCache.peek(accessToken) ?? null)
      : null;

  return {
    items: staleItems ?? view.items,
    loading: view.loading && !staleItems,
    refreshing: refreshing || (view.loading && Boolean(staleItems)),
    error: view.error,
    reload: () => reload(true),
  };
}
