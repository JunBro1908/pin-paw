"use client";

import Link from "next/link";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import type { LostPostItem } from "../model/types";

interface ActiveLostCaseCardProps {
  item: LostPostItem;
  refreshing?: boolean;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function ActiveLostCaseCard({
  item,
  refreshing = false,
}: ActiveLostCaseCardProps) {
  const lostAt = item.lost_at ? formatDateTime(item.lost_at) : "";
  const lastChecked = item.updated_at ? formatDateTime(item.updated_at) : "";

  return (
    <section
      aria-labelledby="active-lost-case-heading"
      className="border-border-subtle bg-surface mb-6 rounded-2xl border p-5 shadow-sm"
    >
      <div className="mb-3 flex flex-wrap items-center gap-2">
        <span className="inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800 dark:bg-amber-900/30 dark:text-amber-300">
          찾는 중
        </span>
        {refreshing ? (
          <Text variant="caption" color="caption">
            업데이트 중
          </Text>
        ) : null}
      </div>
      <Text
        as="h2"
        id="active-lost-case-heading"
        variant="title"
        className="mb-1 font-semibold"
      >
        {item.pet_name?.trim() || "이름 미입력"}
      </Text>
      {lostAt ? (
        <Text
          variant="body"
          className="text-sm text-gray-600 dark:text-gray-400"
        >
          유실 시각 {lostAt}
        </Text>
      ) : null}
      {lastChecked ? (
        <Text variant="caption" color="caption" className="mt-1 block">
          마지막 확인 {lastChecked}
        </Text>
      ) : null}
      <div className="mt-4">
        <Link href={`/recommend?lostPostId=${item.id}`}>
          <Button variant="primary" className="w-full sm:w-auto">
            확인할 제보 보기
          </Button>
        </Link>
      </div>
    </section>
  );
}
