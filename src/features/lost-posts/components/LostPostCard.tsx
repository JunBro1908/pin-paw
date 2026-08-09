"use client";

import Link from "next/link";
import Image from "next/image";
import { Text } from "@/shared/ui/Text";
import { createClient } from "@/shared/supabase/client";
import { StatusBadge } from "./StatusBadge";
import type { LostPostItem } from "../model/types";
import { formatDogSizeLabel } from "@/shared/constants/traitSizes";
import { formatSeoulLostDateTime } from "@/shared/lib/date";
import { SPECIES_UNKNOWN } from "@/features/sightings/constants/breeds";

interface LostPostCardProps {
  item: LostPostItem;
  /** 지정 시 상세 대신 이 링크로 이동 (예: 추천 페이지용) */
  href?: string;
}

export function LostPostCard({ item, href }: LostPostCardProps) {
  const client = createClient();
  const ref = client?.storage?.from("lost");
  const coverUrl = ref
    ? ref.getPublicUrl(item.cover_photo_key).data.publicUrl
    : "";

  const lostAt = formatSeoulLostDateTime(item.lost_at) ?? "시간 정보 없음";
  const traits = [
    item.trait_color?.trim(),
    formatDogSizeLabel(item.trait_size),
    item.trait_species?.trim() === SPECIES_UNKNOWN || item.trait_species?.trim() === "모름"
      ? null
      : item.trait_species?.trim(),
  ]
    .filter((value): value is string => Boolean(value && value !== "unknown" && value !== "모름"))
    .join(" · ");

  const linkHref = href ?? `/my/lost-posts/${item.id}`;

  return (
    <Link
      href={linkHref}
      className="border-border-subtle bg-surface flex gap-4 rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt="대표 사진"
            fill
            sizes="96px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            📷
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span className="mb-1 block">
          <StatusBadge status={item.status} size="sm" />
        </span>
        <Text variant="body" className="truncate font-semibold">
          {item.pet_name?.trim() || "미입력"}
        </Text>
        <Text
          variant="body"
          className="truncate text-sm text-gray-600 dark:text-gray-400"
        >
          {lostAt}
        </Text>
        {traits ? (
          <Text variant="caption" color="caption" className="mt-0.5 truncate">
            {traits}
          </Text>
        ) : null}
        {item.note?.trim() ? (
          <Text
            variant="caption"
            color="caption"
            className="mt-0.5 line-clamp-2 truncate"
          >
            {item.note}
          </Text>
        ) : null}
      </div>
    </Link>
  );
}
