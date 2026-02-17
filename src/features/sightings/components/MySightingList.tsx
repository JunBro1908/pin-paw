"use client";

import { useCallback, useEffect, useState } from "react";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { MySightingCard } from "./MySightingCard";
import type { MySightingItem } from "../model/types";

export function MySightingList() {
  const { session } = useAuth();
  const [items, setItems] = useState<MySightingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchList = useCallback(
    (showLoading = true) => {
      if (!session?.access_token) {
        setLoading(false);
        return;
      }
      if (showLoading) {
        setLoading(true);
        setError(null);
      }
      let cancelled = false;
      fetch("/api/v1/me/sightings?limit=50", {
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
        },
      })
        .then((res) => {
          if (!res.ok) throw new Error("목록을 불러올 수 없습니다.");
          return res.json();
        })
        .then((json) => {
          if (!cancelled && json.success && Array.isArray(json.data)) {
            setItems(json.data);
          }
        })
        .catch((err) => {
          if (!cancelled) setError(err instanceof Error ? err.message : "오류");
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => {
        cancelled = true;
      };
    },
    [session?.access_token]
  );

  useEffect(() => {
    fetchList();
  }, [fetchList]);

  if (loading) {
    return (
      <div className="flex min-h-[120px] items-center justify-center">
        <Text variant="caption" color="caption">
          로딩 중...
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-2">
        <Text variant="body" color="error">
          {error}
        </Text>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-8 dark:border-gray-700 dark:bg-gray-800/30">
        <Text variant="body" color="caption" className="text-center">
          아직 작성한 제보가 없습니다.
        </Text>
        <Link href="/">
          <Button variant="primary">제보하러 가기</Button>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id}>
          <MySightingCard item={item} onDeleted={() => fetchList(false)} />
        </li>
      ))}
    </ul>
  );
}
