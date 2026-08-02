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
      <div className="border-border-subtle bg-surface flex min-h-[140px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-5 py-8 text-center shadow-sm">
        <Text as="h3" variant="title" color="main">
          아직 작성한 제보가 없어요
        </Text>
        <Text variant="body" color="sub" className="max-w-sm">
          길에서 반려동물을 보셨다면, 짧은 제보 하나로 가족을 도울 수 있어요.
        </Text>
        <Link href="/" className="mt-1">
          <Button variant="primary" className="min-h-11">
            제보하러 가기
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
        {items.map((item) => (
          <li key={item.id}>
            <MySightingCard item={item} onDeleted={refresh} />
          </li>
        ))}
      </ul>
    </div>
  );
}
