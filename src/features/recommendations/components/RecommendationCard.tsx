"use client";

import Link from "next/link";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { createClient } from "@/shared/supabase/client";
import type { RecommendationItem } from "../model/types";

interface RecommendationCardProps {
  item: RecommendationItem;
  /** 7-5: 유실글 컨텍스트 — 지도 링크에 전달해 초록 마커 표시, 인정/해제 API용 */
  lostPostId?: string;
  /** 7-5: 인정 토글 후 목록 갱신 */
  onFeedbackChange?: () => void;
  /** 7-5: 인증 토큰 (API 호출용) */
  accessToken?: string;
}

export function RecommendationCard({
  item,
  lostPostId,
  onFeedbackChange,
  accessToken,
}: RecommendationCardProps) {
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
      ? `/map?lat=${item.lat}&lng=${item.lng}&sightingId=${item.sightingId}${lostPostId ? `&lostPostId=${lostPostId}` : ""}`
      : `/map?sightingId=${item.sightingId}${lostPostId ? `&lostPostId=${lostPostId}` : ""}`;

  const handleClaimToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lostPostId || !accessToken) return;
    const isClaimed = item.claimedAsMyDog;
    const url = `/api/v1/me/lost-posts/${lostPostId}/sighting-claims`;
    if (isClaimed) {
      const res = await fetch(`${url}/${item.sightingId}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (res.ok) onFeedbackChange?.();
    } else {
      const res = await fetch(url, {
        method: "POST",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        body: JSON.stringify({ sightingId: item.sightingId }),
      });
      if (res.ok) onFeedbackChange?.();
    }
  };

  const handleRecordSeen = () => {
    if (!accessToken) return;
    fetch("/api/v1/me/sighting-views", {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ sightingId: item.sightingId }),
    }).catch(() => {});
  };

  return (
    <div className="border-border-subtle bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-shadow">
      {item.claimedAsMyDog && (
        <span className="text-primary text-xs font-medium">
          ✓ 내가 인정한 제보
        </span>
      )}
      <Link
        href={mapHref}
        onClick={handleRecordSeen}
        className="flex gap-4 transition-shadow hover:shadow-md"
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
          <Text
            variant="caption"
            color="caption"
            className="text-primary mt-1 block"
          >
            지도에서 보기 →
          </Text>
        </div>
      </Link>
      <div
        className="flex flex-wrap gap-2"
        onClick={(e) => e.stopPropagation()}
      >
        {lostPostId && (
          <Button
            type="button"
            variant={item.claimedAsMyDog ? "secondary" : "primary"}
            className="py-2 text-sm"
            onClick={handleClaimToggle}
          >
            {item.claimedAsMyDog ? "인정 해제" : "내 강아지로 인정"}
          </Button>
        )}
      </div>
    </div>
  );
}
