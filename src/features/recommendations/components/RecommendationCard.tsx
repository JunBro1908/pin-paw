"use client";

import Link from "next/link";
import { Text } from "@/shared/ui/Text";
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
        timeZone: "Asia/Seoul",
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
          ✓ 북마크한 제보
        </span>
      )}
      <div className="flex items-start justify-between gap-3">
        <Link
          href={mapHref}
          onClick={handleRecordSeen}
          className="flex min-w-0 flex-1 gap-4 transition-shadow hover:shadow-md"
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
        {lostPostId && accessToken && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              handleClaimToggle(e);
            }}
            className="shrink-0 rounded-full p-2 transition-transform active:scale-95"
            aria-label={item.claimedAsMyDog ? "북마크 해제" : "북마크 등록"}
          >
            {item.claimedAsMyDog ? (
              <svg
                className="h-8 w-8 text-yellow-500"
                viewBox="0 0 24 24"
                fill="currentColor"
              >
                <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
              </svg>
            ) : (
              <svg
                className="h-8 w-8 text-gray-400"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 20.27 12 17.77 5.82 20.27 7 14.14 2 9.27 8.91 8.26 12 2" />
              </svg>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
