"use client";

import { useState, useCallback, useEffect } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { createClient } from "@/shared/supabase/client";
import { SightingDetailCard } from "@/features/sightings/components/SightingDetailCard";
import type { SightingDetailData } from "@/features/sightings/components/SightingDetailCard";
import { ReportBlockSheet } from "@/features/moderation/components/ReportBlockSheet";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import { useDialogFocus } from "@/shared/ui/dialog-focus";
import {
  RECOMMENDATION_PRIORITY_LABELS,
  type RecommendationItem,
} from "../model/types";

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
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [detail, setDetail] = useState<SightingDetailData | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [actionToast, setActionToast] = useState<string | null>(null);
  const [claimed, setClaimed] = useState(Boolean(item.claimedAsMyDog));
  const [claimPending, setClaimPending] = useState(false);

  const closeModal = useCallback(() => setModalOpen(false), []);
  const { dialogRef } = useDialogFocus({
    active: !reportOpen && modalOpen,
    onClose: closeModal,
  });

  useEffect(() => {
    setClaimed(Boolean(item.claimedAsMyDog));
  }, [item.claimedAsMyDog, item.sightingId]);

  const client = createClient();
  const storageRef = client?.storage?.from("sightings");
  const getImageUrl = useCallback(
    (key: string) => {
      if (!storageRef) return "";
      return storageRef.getPublicUrl(key).data.publicUrl;
    },
    [storageRef]
  );

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

  const openModal = useCallback(() => {
    setModalOpen(true);
    setDetail(null);
    setDetailError(null);
    setDetailLoading(true);
    handleRecordSeen();
    fetch(`/api/v1/auth/sightings/${encodeURIComponent(item.sightingId)}`, {
      credentials: "include",
      headers: accessToken ? { Authorization: `Bearer ${accessToken}` } : {},
    })
      .then((res) => res.json())
      .then((json) => {
        if (json?.success && json?.data) {
          setDetail(json.data as SightingDetailData);
        } else {
          setDetailError(json?.error?.message ?? "제보를 불러올 수 없습니다.");
        }
      })
      .catch(() => setDetailError("제보를 불러오는 중 오류가 발생했습니다."))
      .finally(() => setDetailLoading(false));
  }, [item.sightingId, accessToken, handleRecordSeen]);

  const handleMapClick = useCallback(() => {
    closeModal();
    router.push(mapHref);
  }, [closeModal, router, mapHref]);

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
      // Reconcile list in the background; UI already updated.
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
        className="focus-visible:outline-action-primary flex min-h-11 min-w-11 items-center justify-center rounded-full p-1.5 transition-transform focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95 disabled:opacity-60"
        aria-label={claimed ? "북마크 해제" : "북마크 등록"}
      >
        {claimed ? (
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
    ) : null;

  return (
    <>
      <div className="border-border-subtle bg-surface flex flex-col gap-3 rounded-xl border p-4 shadow-sm transition-shadow">
        <div className="flex flex-wrap items-center justify-between gap-2">
          {claimed && (
            <span className="text-primary text-xs font-medium">
              ✓ 북마크한 제보
            </span>
          )}
          <Link
            href={mapHref}
            onClick={handleRecordSeen}
            className="text-action-primary focus-visible:outline-action-primary ml-auto inline-flex min-h-11 items-center rounded-lg px-2 text-xs font-semibold focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            지도에서 보기 →
          </Link>
        </div>
        <div className="flex items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 gap-4">
            <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-lg bg-gray-100">
              {thumbUrl ? (
                <Image
                  src={thumbUrl}
                  alt="목격 사진"
                  fill
                  sizes="80px"
                  className="object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">
                  📷
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-baseline gap-2">
                <Text
                  as="p"
                  variant="title"
                  className="text-action-primary text-2xl font-bold tracking-tight"
                  aria-label={`유사도 ${item.matchPercent}퍼센트`}
                >
                  {item.matchPercent}%
                </Text>
                <Text
                  variant="caption"
                  className="text-text-sub inline-flex rounded-full bg-surface-soft px-2 py-0.5 text-xs font-medium"
                >
                  {RECOMMENDATION_PRIORITY_LABELS[item.priority]}
                </Text>
              </div>
              <Text variant="body" className="mt-1 block text-sm font-medium">
                {item.matchSummary}
              </Text>
              <Text variant="body" className="text-text-sub mt-2 block font-semibold">
                {occurredAt}
              </Text>
              <ul
                aria-label="거리·시간"
                className="mt-2 flex flex-wrap gap-1.5"
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
                color="caption"
                className="mt-2 block leading-relaxed"
              >
                {
                  "유사도와 근거는 확인 순서를 돕기 위한 정보이며 동일한 동물임을 보장하지 않습니다."
                }
              </Text>
              <button
                type="button"
                onClick={openModal}
                className="text-primary focus-visible:outline-action-primary mt-1 inline-flex min-h-11 items-center rounded-lg text-sm font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              >
                상세 보기
              </button>
            </div>
          </div>
          {bookmarkButton}
        </div>
      </div>

      {modalOpen && (
        <div
          ref={dialogRef as React.RefObject<HTMLDivElement>}
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          onClick={closeModal}
          role="dialog"
          aria-modal={reportOpen ? undefined : "true"}
          aria-hidden={reportOpen ? true : undefined}
          inert={reportOpen ? true : undefined}
          aria-label="제보 상세"
        >
          <div
            className="animate-in fade-in zoom-in-95 w-full max-w-md duration-200"
            onClick={(e) => e.stopPropagation()}
          >
            {detailLoading && (
              <div className="border-border-subtle bg-surface rounded-2xl border px-6 py-12 text-center shadow-sm">
                <Text variant="body" color="caption">
                  로딩 중...
                </Text>
              </div>
            )}
            {detailError && !detailLoading && (
              <div className="border-border-subtle bg-surface rounded-2xl border px-6 py-8 shadow-sm">
                <Text variant="body" color="caption" className="mb-4 block">
                  {detailError}
                </Text>
                <Button variant="secondary" onClick={closeModal}>
                  닫기
                </Button>
              </div>
            )}
            {detail && !detailLoading && (
              <SightingDetailCard
                sighting={detail}
                getImageUrl={getImageUrl}
                onClose={closeModal}
                rightSlot={bookmarkButton}
                footer={
                  <div className="space-y-2">
                    <Button
                      variant="primary"
                      className="w-full text-xs"
                      onClick={handleMapClick}
                    >
                      지도에서 보기
                    </Button>
                    {accessToken ? (
                      <Button
                        variant="secondary"
                        className="w-full text-xs"
                        onClick={() => setReportOpen(true)}
                      >
                        신고 / 차단
                      </Button>
                    ) : null}
                    {actionToast ? (
                      <Text variant="caption" color="caption">
                        {actionToast}
                      </Text>
                    ) : null}
                  </div>
                }
              />
            )}
          </div>
        </div>
      )}
      {reportOpen ? (
        <ReportBlockSheet
          targetType="sighting"
          targetId={item.sightingId}
          authorUserId={detail?.author_user_id}
          onClose={() => setReportOpen(false)}
          onCompleted={(message) => setActionToast(message)}
        />
      ) : null}
    </>
  );
}
