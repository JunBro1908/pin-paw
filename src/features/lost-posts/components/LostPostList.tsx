"use client";

import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import Link from "next/link";
import { LostPostCard } from "./LostPostCard";
import { useMyLostPosts } from "../hooks/useMyLostPosts";

export function LostPostList() {
  const { items, loading, refreshing, error } = useMyLostPosts();

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

  if (error && items.length === 0) {
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
        {items.map((item) => (
          <li key={item.id}>
            <LostPostCard item={item} />
          </li>
        ))}
      </ul>
    </div>
  );
}
