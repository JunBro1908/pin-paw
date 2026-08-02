"use client";

import Link from "next/link";
import Image from "next/image";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { StatusBadge } from "./StatusBadge";
import {
  formatLostCaseDateTime,
  getLostPostCoverUrl,
} from "../lib/lost-post-cover";
import type { LostPostItem } from "../model/types";
import { cn } from "@/shared/lib/cn";

interface ActiveLostCaseCardProps {
  item: LostPostItem;
  refreshing?: boolean;
  /** @deprecated Full-width page-snap carousel only — ignored. */
  compact?: boolean;
  className?: string;
  /** Prefer detail over recommend for primary CTA (default: detail) */
  primaryAction?: "recommend" | "detail";
}

export function ActiveLostCaseCard({
  item,
  refreshing = false,
  compact: _compact = false,
  className,
  primaryAction = "detail",
}: ActiveLostCaseCardProps) {
  void _compact;
  const coverUrl = getLostPostCoverUrl(item.cover_photo_key);
  const lostAt = formatLostCaseDateTime(item.lost_at);
  const lastChecked = formatLostCaseDateTime(item.updated_at);
  const detailHref = `/my/lost-posts/${item.id}`;
  const recommendHref = `/recommend?lostPostId=${item.id}`;
  const primaryHref =
    primaryAction === "detail" ? detailHref : recommendHref;
  const primaryLabel =
    primaryAction === "detail" ? "유실글 보기" : "추천 제보 보기";

  return (
    <article
      className={cn(
        "border-border-subtle relative overflow-hidden rounded-2xl border bg-white shadow-sm w-full max-w-none",
        className
      )}
    >
      <Link
        href={detailHref}
        className="focus-visible:outline-action-primary block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={`${item.pet_name?.trim() || "유실글"} 상세 보기`}
      >
        <div className="relative aspect-[2/1] overflow-hidden bg-gray-100 sm:aspect-[21/9]">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt=""
              fill
              sizes="(max-width: 768px) 100vw, 720px"
              className="object-cover"
            />
          ) : (
            <div
              className="from-accent-warm/25 via-surface-soft to-primary-soft/40 absolute inset-0 bg-gradient-to-br"
              aria-hidden
            />
          )}
          <div className="absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-black/35 to-transparent" />
        </div>
      </Link>

      {refreshing ? (
        <div className="absolute top-3 right-3 z-10">
          <Text
            variant="caption"
            className="rounded-full bg-white/95 px-2 py-0.5 text-xs shadow-sm"
          >
            업데이트 중
          </Text>
        </div>
      ) : null}

      <div className="space-y-3 bg-white p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} size="sm" />
        </div>
        <div>
          <Text as="h2" variant="title" className="font-semibold text-gray-900">
            {item.pet_name?.trim() || "이름 미입력"}
          </Text>
          {lostAt ? (
            <Text
              variant="body"
              className="mt-1 block text-sm text-gray-600"
            >
              유실 시각 {lostAt}
            </Text>
          ) : null}
          {lastChecked ? (
            <Text variant="caption" className="mt-0.5 block text-gray-500">
              마지막 확인 {lastChecked}
            </Text>
          ) : null}
        </div>
        <Link href={primaryHref} className="block">
          <Button variant="primary" className="min-h-11 w-full">
            {primaryLabel}
          </Button>
        </Link>
      </div>
    </article>
  );
}
