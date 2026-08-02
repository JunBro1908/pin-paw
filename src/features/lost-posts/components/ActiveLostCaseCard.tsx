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
  /** Prefer detail over recommend for primary CTA (default: recommend) */
  primaryAction?: "recommend" | "detail";
}

function EditIcon() {
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
      <path d="m15 5 4 4" />
    </svg>
  );
}

export function ActiveLostCaseCard({
  item,
  refreshing = false,
  compact: _compact = false,
  className,
  primaryAction = "recommend",
}: ActiveLostCaseCardProps) {
  void _compact;
  const coverUrl = getLostPostCoverUrl(item.cover_photo_key);
  const lostAt = formatLostCaseDateTime(item.lost_at);
  const lastChecked = formatLostCaseDateTime(item.updated_at);
  const detailHref = `/my/lost-posts/${item.id}`;
  const editHref = `${detailHref}?edit=1`;
  const recommendHref = `/recommend?lostPostId=${item.id}`;
  const primaryHref =
    primaryAction === "detail" ? detailHref : recommendHref;
  const primaryLabel =
    primaryAction === "detail" ? "사건 보기" : "추천 제보 보기";

  return (
    <article
      className={cn(
        "border-border-subtle bg-surface relative overflow-hidden rounded-2xl border shadow-sm w-full max-w-none",
        className
      )}
    >
      <Link
        href={detailHref}
        className="focus-visible:outline-action-primary block focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
        aria-label={`${item.pet_name?.trim() || "유실 사건"} 상세 보기`}
      >
        <div className="bg-surface-soft relative aspect-[2/1] overflow-hidden sm:aspect-[21/9]">
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

      <div className="absolute top-3 right-3 z-10 flex items-center gap-2">
        {refreshing ? (
          <Text
            variant="caption"
            className="bg-surface/90 rounded-full px-2 py-0.5 text-xs shadow-sm"
          >
            업데이트 중
          </Text>
        ) : null}
        <Link
          href={editHref}
          className="border-border-subtle bg-surface/95 text-text-main hover:bg-surface-soft focus-visible:outline-action-primary inline-flex h-9 w-9 items-center justify-center rounded-full border shadow-sm backdrop-blur-sm focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label="유실글 수정"
          onClick={(event) => event.stopPropagation()}
        >
          <EditIcon />
        </Link>
      </div>

      <div className="space-y-3 p-4">
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={item.status} size="sm" />
        </div>
        <div>
          <Text as="h2" variant="title" className="font-semibold">
            {item.pet_name?.trim() || "이름 미입력"}
          </Text>
          {lostAt ? (
            <Text
              variant="body"
              className="text-text-sub mt-1 block text-sm"
            >
              유실 시각 {lostAt}
            </Text>
          ) : null}
          {lastChecked ? (
            <Text variant="caption" color="caption" className="mt-0.5 block">
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
