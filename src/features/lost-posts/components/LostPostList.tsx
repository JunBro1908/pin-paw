"use client";

import { useEffect, useState } from "react";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import Link from "next/link";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostPostCard } from "./LostPostCard";
import type { LostPostItem } from "../model/types";

export function LostPostList() {
  const { session } = useAuth();
  const [items, setItems] = useState<LostPostItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }

    let cancelled = false;
    fetch("/api/v1/lost-posts?limit=50", {
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
  }, [session?.access_token]);

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <Text variant="caption" color="caption">
          로딩 중...
        </Text>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
        <Text variant="body" color="error">
          {error}
        </Text>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="flex min-h-[180px] flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 py-10 dark:border-gray-700 dark:bg-gray-800/30">
        <Text variant="body" color="caption" className="text-center">
          아직 등록된 유실글이 없어요.
        </Text>
        <Text variant="caption" color="caption" className="text-center">
          유실글을 등록하면 비슷한 목격 제보를 추천해 드려요.
        </Text>
        <Link href="/my/lost-posts/new">
          <Button variant="primary">첫 유실글 등록하기</Button>
        </Link>
      </div>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((item) => (
        <li key={item.id}>
          <LostPostCard item={item} />
        </li>
      ))}
    </ul>
  );
}
