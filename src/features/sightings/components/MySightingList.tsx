"use client";

import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import Link from "next/link";
import { MySightingCard } from "./MySightingCard";
import {
  invalidateMySightingsCache,
  useMySightings,
} from "../hooks/useMySightings";

export function MySightingList() {
  const { items, loading, refreshing, error, reload } = useMySightings();

  const refresh = () => {
    invalidateMySightingsCache();
    void reload();
  };

  if (loading) {
    return (
      <div className="flex min-h-[120px] flex-col items-center justify-center gap-3">
        <div className="bg-border-subtle h-3 w-36 animate-pulse rounded-full" />
        <div className="bg-border-subtle h-3 w-24 animate-pulse rounded-full" />
        <Text variant="caption" color="caption">
          제보를 불러오는 중...
        </Text>
      </div>
    );
  }

  if (error && items.length === 0) {
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
            <MySightingCard item={item} onDeleted={refresh} />
          </li>
        ))}
      </ul>
    </div>
  );
}
