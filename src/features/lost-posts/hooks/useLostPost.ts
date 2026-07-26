"use client";

import { useState, useCallback, useEffect } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { LostPostItem } from "../model/types";

interface UseLostPostReturn {
  data: LostPostItem | null;
  error: string | null;
  isLoading: boolean;
  mutate: () => Promise<void>;
}

/**
 * 단건 유실글 조회 훅 (fetch + 재검증)
 */
export function useLostPost(lostPostId: string | null): UseLostPostReturn {
  const { session } = useAuth();
  const [data, setData] = useState<LostPostItem | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const fetchOne = useCallback(async () => {
    if (!lostPostId || !session?.access_token) {
      setData(null);
      setError(null);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/v1/lost-posts/${lostPostId}`, {
        credentials: "include",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        if (res.status === 404) setError("유실글을 찾을 수 없습니다.");
        else setError("불러오기에 실패했습니다.");
        setData(null);
        return;
      }
      const json = await res.json();
      if (json.success) setData(json.data);
      else setData(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "오류가 발생했습니다.");
      setData(null);
    } finally {
      setIsLoading(false);
    }
  }, [lostPostId, session?.access_token]);

  useEffect(() => {
    fetchOne();
  }, [fetchOne]);

  return { data, error, isLoading, mutate: fetchOne };
}
