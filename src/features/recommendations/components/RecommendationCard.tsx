"use client";

import { useState, useCallback, useEffect, useId, useRef } from "react";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Text } from "@/shared/ui/Text";
import { Icon } from "@/shared/ui/Icon";
import { createClient } from "@/shared/supabase/client";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import { buildRecommendationMapHref } from "@/features/map/lib/map-deep-link-focus";
import { RecommendationItem } from "../model/types";

const SIMILARITY_DISCLAIMER =
  "유사도와 근거는 확인 순서를 돕기 위한 정보이며 동일한 동물임을 보장하지 않습니다.";

interface RecommendationCardProps {
  item: RecommendationItem;
  /** 7-5: 유실글 컨텍스트 — 지도 링크에 전달해 초록 마커 표시, 인정/해제 API용 */
  lostPostId?: string;
  /** 7-5: 인정 토글 후 목록 갱신 */
  onFeedbackChange?: () => void;
  /** 7-5: 인증 토큰 (API 호출용) */
  accessToken?: string;
}

function SimilarityInfoTip() {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
      }}
    >
      <button
        type="button"
        aria-label="유사도 안내"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          setOpen((value) => !value);
        }}
        className="text-text-caption hover:text-text-sub focus-visible:outline-action-primary inline-flex h-3.5 w-3.5 items-center justify-center rounded-full border border-current focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <Icon name="info" size={10} />
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="border-border-subtle bg-surface text-text-sub absolute top-full left-1/2 z-20 mt-1.5 w-max max-w-[14rem] -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-left text-xs leading-relaxed shadow-sm"
        >
          {SIMILARITY_DISCLAIMER}
        </span>
      ) : null}
    </span>
  );
}

export function RecommendationCard({
  item,
  lostPostId,
  onFeedbackChange,
  accessToken,
}: RecommendationCardProps) {
  const router = useRouter();
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(Boolean(item.claimedAsMyDog));
  const [claimPending, setClaimPending] = useState(false);

  useEffect(() => {
    setClaimed(Boolean(item.claimedAsMyDog));
  }, [item.claimedAsMyDog, item.sightingId]);

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

  const mapHref = buildRecommendationMapHref(item.sightingId, lostPostId);

  const handleRecordSeen = useCallback(() => {
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
  }, [accessToken, item.sightingId]);

  const goToMap = useCallback(() => {
    handleRecordSeen();
    router.push(mapHref);
  }, [handleRecordSeen, router, mapHref]);

  const handleClaimToggle = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (!lostPostId || !accessToken || claimPending) return;

    const nextClaimed = !claimed;
    const previousClaimed = claimed;
    setClaimed(nextClaimed);
    setClaimPending(true);

    const url = `/api/v1/me/lost-posts/${lostPostId}/sighting-claims`;
    try {
      const res = nextClaimed
        ? await fetch(url, {
            method: "POST",
            credentials: "include",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${accessToken}`,
            },
            body: JSON.stringify({ sightingId: item.sightingId }),
          })
        : await fetch(`${url}/${item.sightingId}`, {
            method: "DELETE",
            credentials: "include",
            headers: { Authorization: `Bearer ${accessToken}` },
          });

      if (!res.ok) {
        setClaimed(previousClaimed);
        const json = (await res.json().catch(() => null)) as {
          error?: { message?: string };
        } | null;
        setActionToast(
          json?.error?.message ??
            (nextClaimed
              ? "북마크 등록에 실패했습니다."
              : "북마크 해제에 실패했습니다.")
        );
        return;
      }

      if (nextClaimed) {
        void trackFunnelEvent(accessToken, {
          name: "sighting_claimed",
          lostPostId,
          sightingId: item.sightingId,
          properties: { source: "recommendation_card" },
        });
      }
      onFeedbackChange?.();
    } catch {
      setClaimed(previousClaimed);
      setActionToast(
        nextClaimed
          ? "북마크 등록에 실패했습니다."
          : "북마크 해제에 실패했습니다."
      );
    } finally {
      setClaimPending(false);
    }
  };

  const bookmarkButton =
    lostPostId && accessToken ? (
      <button
        type="button"
        disabled={claimPending}
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          void handleClaimToggle(e);
        }}
        className="focus-visible:outline-action-primary flex min-h-11 min-w-11 shrink-0 items-center justify-center rounded-full p-1.5 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
        aria-label={claimed ? "북마크 해제" : "북마크 등록"}
      >
        {claimed ? (
          <svg
            className="h-5 w-5 text-yellow-500"
            viewBox="0 0 24 24"
            fill="currentColor"
          >
            <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z" />
          </svg>
        ) : (
          <svg
            className="h-5 w-5 text-gray-400"
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
    ) : null;

  return (
    <div
      role="link"
      tabIndex={0}
      aria-label="지도에서 제보 보기"
      onClick={goToMap}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          goToMap();
        }
      }}
      className="border-border-subtle bg-surface focus-visible:outline-action-primary flex cursor-pointer flex-col gap-3 rounded-2xl border p-4 shadow-sm transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2"
    >
      {claimed ? (
        <span className="text-primary text-xs font-medium">✓ 북마크한 제보</span>
      ) : null}

      <div className="flex items-stretch gap-3">
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-gray-100 dark:bg-gray-800">
          {thumbUrl ? (
            <Image
              src={thumbUrl}
              alt="목격 사진"
              fill
              sizes="80px"
              className="object-cover"
            />
          ) : (
            <div className="text-text-caption flex h-full w-full items-center justify-center text-2xl">
              📷
            </div>
          )}
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex items-start gap-1">
            <div className="min-w-0 flex-1">
              <ul
                aria-label="거리·시간"
                className="mb-1.5 flex flex-wrap gap-1.5"
              >
                {item.contextChips.map((chip) => (
                  <li
                    key={chip}
                    className="bg-surface-soft text-text-sub rounded-lg px-2 py-1 text-xs"
                  >
                    {chip}
                  </li>
                ))}
              </ul>
              <Text
                variant="caption"
                className="text-text-main block text-xs font-medium"
              >
                {occurredAt}
              </Text>
              <div className="mt-1 flex items-center gap-1.5">
                <Text
                  as="p"
                  variant="caption"
                  className="text-action-primary text-sm font-medium"
                  aria-label={`유사도 ${item.matchPercent}퍼센트`}
                >
                  {item.matchPercent}%
                </Text>
                <SimilarityInfoTip />
              </div>
            </div>
            {bookmarkButton}
          </div>

          <span className="text-action-primary mt-auto inline-flex min-h-11 items-center pt-1 text-sm font-medium">
            지도에서 보기
          </span>
        </div>
      </div>

      {actionToast ? (
        <Text variant="caption" color="caption">
          {actionToast}
        </Text>
      ) : null}
    </div>
  );
}
