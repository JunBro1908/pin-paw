"use client";

import Link from "next/link";
import Image from "next/image";
import { useState } from "react";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Toast } from "@/shared/ui/Toast";
import { StatusBadge } from "./StatusBadge";
import { ShareLostPostButton } from "./ShareLostPostButton";
import {
  getLostPostCoverUrl,
} from "../lib/lost-post-cover";
import type { LostPostItem } from "../model/types";
import { cn } from "@/shared/lib/cn";
import { formatDogSizeLabel } from "@/shared/constants/traitSizes";
import { formatSeoulLostDateTime } from "@/shared/lib/date";
import { SPECIES_UNKNOWN } from "@/features/sightings/constants/breeds";

interface ActiveLostCaseCardProps {
  item: LostPostItem;
  refreshing?: boolean;
  /** @deprecated Full-width page-snap carousel only — ignored. */
  compact?: boolean;
  className?: string;
  /** Prefer detail over recommend for primary CTA (default: detail) */
  primaryAction?: "recommend" | "detail";
  /** When set, primary CTA runs in place instead of navigating. */
  onPrimaryAction?: (item: LostPostItem) => void;
}

const traitChipClass =
  "bg-surface-soft text-text-sub rounded-lg px-2.5 py-1 text-xs font-medium";

function buildLostCaseTraitTags(item: LostPostItem): string[] {
  const tags: string[] = [];

  const species = item.trait_species?.trim();
  if (species && species !== SPECIES_UNKNOWN && species !== "모름") {
    tags.push(species);
  }

  const size = formatDogSizeLabel(item.trait_size);
  if (size) tags.push(size);

  const color = item.trait_color?.trim();
  if (color && color !== "unknown" && color !== "모름") {
    tags.push(color);
  }

  return tags;
}

export function ActiveLostCaseCard({
  item,
  refreshing = false,
  compact: _compact = false,
  className,
  primaryAction = "detail",
  onPrimaryAction,
}: ActiveLostCaseCardProps) {
  void _compact;
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const coverUrl = getLostPostCoverUrl(item.cover_photo_key);
  const lostAt = formatSeoulLostDateTime(item.lost_at) ?? "시간 정보 없음";
  const approximateRegion = item.approximate_region?.trim() || "지역 정보 없음";
  const traitTags = buildLostCaseTraitTags(item);
  const note = item.note?.trim() || "";
  const detailHref = `/my/lost-posts/${item.id}`;
  const recommendHref = `/recommend?lostPostId=${item.id}`;
  const primaryHref =
    primaryAction === "detail" ? detailHref : recommendHref;
  const primaryLabel =
    primaryAction === "detail" ? "유실글 보기" : "추천 제보 보기";

  return (
    <article
      className={cn(
        "surface-light border-border-subtle relative w-full max-w-none overflow-hidden rounded-2xl border bg-white shadow-sm",
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
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={item.status} size="sm" />
          {item.status === "searching" ? (
            <ShareLostPostButton
              lostPostId={item.id}
              petName={item.pet_name}
              onCopied={() =>
                setToast({
                  message: "공유 링크를 복사했습니다.",
                  type: "success",
                })
              }
              onError={() =>
                setToast({
                  message: "공유에 실패했습니다.",
                  type: "error",
                })
              }
            />
          ) : null}
        </div>
        <div className="min-w-0">
          <Text
            as="h2"
            variant="title"
            color="main"
            className="truncate font-semibold"
          >
            {item.pet_name?.trim() || "이름 미입력"}
          </Text>
          <dl className="text-text-sub mt-2 space-y-0.5 text-sm">
            <div className="flex min-w-0 gap-2">
              <dt className="text-text-caption shrink-0">잃어버린 시간</dt>
              <dd className="min-w-0 truncate">{lostAt}</dd>
            </div>
            <div className="flex min-w-0 gap-2">
              <dt className="text-text-caption shrink-0">잃어버린 지역</dt>
              <dd className="min-w-0 truncate">{approximateRegion}</dd>
            </div>
          </dl>
          {traitTags.length > 0 ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {traitTags.map((label) => (
                <li key={label} className={traitChipClass}>
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
          {note ? (
            <Text
              variant="caption"
              color="caption"
              className="mt-2 block line-clamp-2"
            >
              특이사항 : {note}
            </Text>
          ) : null}
        </div>
        {onPrimaryAction ? (
          <Button
            type="button"
            variant="primary"
            className="min-h-11 w-full"
            onClick={(event) => {
              event.stopPropagation();
              onPrimaryAction(item);
            }}
          >
            {primaryLabel}
          </Button>
        ) : (
          <Link href={primaryHref} className="block">
            <Button variant="primary" className="min-h-11 w-full">
              {primaryLabel}
            </Button>
          </Link>
        )}
      </div>
      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
    </article>
  );
}
