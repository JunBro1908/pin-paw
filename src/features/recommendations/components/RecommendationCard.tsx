"use client";

import Link from "next/link";
import { Text } from "@/shared/ui/Text";
import { createClient } from "@/shared/supabase/client";
import type { RecommendationItem } from "../model/types";

interface RecommendationCardProps {
  item: RecommendationItem;
}

export function RecommendationCard({ item }: RecommendationCardProps) {
  const client = createClient();
  const storageRef = client?.storage?.from("sightings");
  const firstKey = item.photoKeys?.[0];
  const thumbUrl =
    storageRef && firstKey
      ? storageRef.getPublicUrl(firstKey).data.publicUrl
      : "";

  const occurredAt = item.occurredAt
    ? new Date(item.occurredAt).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const mapHref =
    item.lat != null && item.lng != null
      ? `/map?lat=${item.lat}&lng=${item.lng}&sightingId=${item.sightingId}`
      : `/map?sightingId=${item.sightingId}`;

  return (
    <Link
      href={mapHref}
      className="border-border-subtle bg-surface flex gap-4 rounded-xl border p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="목격 사진"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            📷
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <Text variant="body" className="font-medium">
          {occurredAt}
        </Text>
        <Text variant="caption" color="caption" className="mt-0.5 block">
          유사도 {(item.similarity * 100).toFixed(1)}%
        </Text>
        <Text variant="caption" color="caption" className="mt-1 block text-primary">
          지도에서 보기 →
        </Text>
      </div>
    </Link>
  );
}
