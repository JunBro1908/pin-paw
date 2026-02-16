"use client";

import Link from "next/link";
import { Text } from "@/shared/ui/Text";
import { createClient } from "@/shared/supabase/client";
import type { LostPostItem } from "../model/types";

const statusLabel: Record<string, string> = {
  searching: "찾는 중",
  found: "찾았어요",
  closed: "마감",
};

export function LostPostCard({ item }: { item: LostPostItem }) {
  const client = createClient();
  const ref = client?.storage?.from("lost");
  const coverUrl = ref
    ? ref.getPublicUrl(item.cover_photo_key).data.publicUrl
    : "";

  const lostAt = item.lost_at
    ? new Date(item.lost_at).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const traits = [item.trait_color, item.trait_size, item.trait_state]
    .filter(Boolean)
    .join(" · ");

  return (
    <Link
      href={`/my/lost-posts/${item.id}`}
      className="border-border-subtle bg-surface flex gap-4 rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md"
    >
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="대표 사진"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            📷
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1">
        <span
          className="bg-primary-soft text-primary mb-1 inline-block rounded-full px-2 py-0.5 text-xs font-medium"
          data-status={item.status}
        >
          {statusLabel[item.status] ?? item.status}
        </span>
        <Text variant="body" className="font-medium">
          {lostAt}
        </Text>
        {traits ? (
          <Text variant="caption" color="caption" className="mt-0.5 truncate">
            {traits}
          </Text>
        ) : null}
      </div>
    </Link>
  );
}
