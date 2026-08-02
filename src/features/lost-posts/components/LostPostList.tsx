"use client";

import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import Link from "next/link";
import { LostPostCard } from "./LostPostCard";
import { useMyLostPosts } from "../hooks/useMyLostPosts";
import type { LostPostItem } from "../model/types";

interface LostPostListProps {
  items?: LostPostItem[];
  loading?: boolean;
  refreshing?: boolean;
  error?: string | null;
}

export function LostPostList({
  items,
  loading: providedLoading,
  refreshing: providedRefreshing,
  error: providedError,
}: LostPostListProps = {}) {
  const hooked = useMyLostPosts({ enabled: items === undefined });
  const resolvedItems = items ?? hooked.items;
  const loading =
    items !== undefined ? Boolean(providedLoading) : hooked.loading;
  const refreshing =
    items !== undefined ? Boolean(providedRefreshing) : hooked.refreshing;
  const error = items !== undefined ? (providedError ?? null) : hooked.error;

  if (loading) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-3">
        <div className="bg-border-subtle h-3 w-40 animate-pulse rounded-full" />
        <div className="bg-border-subtle h-3 w-28 animate-pulse rounded-full" />
        <Text variant="caption" color="caption">
          유실글을 불러오는 중...
        </Text>
      </div>
    );
  }

  if (error && resolvedItems.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center gap-2">
        <Text variant="body" color="error">
          {error}
        </Text>
      </div>
    );
  }

  if (resolvedItems.length === 0) {
    return (
      <div className="border-border-subtle bg-surface flex min-h-[180px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-5 py-10 text-center shadow-sm">
        <Text as="h2" variant="title" color="main">
          아직 올린 유실글이 없어요
        </Text>
        <Text variant="body" color="sub" className="max-w-sm">
          유실글을 올리면 비슷한 목격 제보를 추천해 드려요.
        </Text>
        <Link href="/my/lost-posts/new" className="mt-1">
          <Button variant="primary" className="min-h-11">
            유실글 올리기
          </Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="relative">
      {refreshing ? (
        <Text
          variant="caption"
          color="caption"
          className="mb-2 block text-right"
        >
          업데이트 중...
        </Text>
      ) : null}
      <ul className="space-y-4">
        {resolvedItems.map((item) => (
          <li key={item.id}>
            <LostPostCard item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
