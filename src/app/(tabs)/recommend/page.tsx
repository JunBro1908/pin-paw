"use client";

import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { Suspense, useCallback, useEffect, useState } from "react";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/Icon";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostCaseCarousel } from "@/features/lost-posts/components/LostCaseCarousel";
import { useMyLostPosts } from "@/features/lost-posts/hooks/useMyLostPosts";
import type { LostPostItem } from "@/features/lost-posts/model/types";
import { useRecommendations } from "@/features/recommendations/hooks/useRecommendations";
import { RecommendationCard } from "@/features/recommendations/components/RecommendationCard";
import {
  applyDraftRange,
  createRangeState,
  updateDraftRange,
} from "@/features/recommendations/lib/recommendation-interaction";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import { ScrollablePanel } from "@/shared/ui/ScrollablePanel";

function RecommendContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  // URL lostPostId is the applied selection (CTA / deep link). Draft is carousel index.
  const appliedLostPostId = searchParams.get("lostPostId");
  const {
    items: lostPosts,
    loading,
    refreshing,
    error: listError,
    reload: reloadLostPosts,
  } = useMyLostPosts();

  const [draftLostPostId, setDraftLostPostId] = useState<string | null>(
    appliedLostPostId
  );
  const [syncedAppliedId, setSyncedAppliedId] = useState(appliedLostPostId);

  // Keep draft aligned when deep link / applied URL changes (render-time sync).
  if (appliedLostPostId !== syncedAppliedId) {
    setSyncedAppliedId(appliedLostPostId);
    if (appliedLostPostId) {
      setDraftLostPostId(appliedLostPostId);
    }
  }

  const selectedLostPostId =
    draftLostPostId ?? lostPosts[0]?.id ?? null;

  const syncUrl = useCallback(
    (lostPostId: string) => {
      const next = `/recommend?lostPostId=${lostPostId}`;
      if (typeof window !== "undefined") {
        const current = `${window.location.pathname}${window.location.search}`;
        if (current === next) return;
      }
      router.replace(next, { scroll: false });
    },
    [router]
  );

  const handleSelect = useCallback(
    (item: LostPostItem) => {
      setDraftLostPostId(item.id);
      if (appliedLostPostId) {
        syncUrl(item.id);
      }
    },
    [appliedLostPostId, syncUrl]
  );

  const handlePrimaryAction = useCallback(
    (item: LostPostItem) => {
      setDraftLostPostId(item.id);
      syncUrl(item.id);
    },
    [syncUrl]
  );

  return (
    <Container className="py-8">
      <header className="mb-8">
        <Text as="h1" variant="title" className="text-2xl">
          비슷한 제보 찾기
        </Text>
        <Text variant="body" color="sub" className="mt-1">
          가능성이 높은 목격 제보를 모아 보여드려요.
        </Text>
      </header>
      {loading ? (
        <div className="space-y-3">
          <div className="bg-border-subtle h-3 w-40 animate-pulse rounded-full" />
          <div className="bg-border-subtle h-3 w-28 animate-pulse rounded-full" />
          <Text variant="caption" color="caption">
            유실글을 불러오는 중...
          </Text>
        </div>
      ) : listError && lostPosts.length === 0 ? (
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-900/20">
          <Text variant="body" color="caption" className="mb-2 block">
            {listError}
          </Text>
          <Button variant="secondary" onClick={() => void reloadLostPosts()}>
            다시 시도
          </Button>
        </div>
      ) : lostPosts.length === 0 ? (
        <div className="border-border-subtle bg-surface flex min-h-[200px] flex-col items-center justify-center gap-3 rounded-2xl border border-dashed px-5 py-10 text-center shadow-sm">
          <Text as="h2" variant="title" color="main">
            아직 올린 유실글이 없어요
          </Text>
          <Text variant="body" color="sub" className="max-w-sm">
            유실글을 올리면 비슷한 목격 제보를 모아 보여드려요.
          </Text>
          <Link href="/my/lost-posts/new" className="mt-1">
            <Button variant="primary" className="min-h-11">
              유실글 올리기
            </Button>
          </Link>
        </div>
      ) : (
        <>
          <LostCaseCarousel
            items={lostPosts}
            refreshing={refreshing}
            selectedId={selectedLostPostId}
            onSelect={handleSelect}
            onPrimaryAction={handlePrimaryAction}
            heading="유실글 선택"
            primaryAction="recommend"
          />
          {appliedLostPostId ? (
            <RecommendWithLostPost lostPostId={appliedLostPostId} />
          ) : null}
        </>
      )}
    </Container>
  );
}

const RADIUS_OPTIONS = [1, 2, 5, 8, 10, 20, 50, 100] as const;
const DAYS_OPTIONS = [1, 3, 7, 8, 14, 30] as const;

const DEFAULT_RADIUS_KM = 8;
const DEFAULT_DAYS = 8;

function RecommendWithLostPost({ lostPostId }: { lostPostId: string }) {
  const { session } = useAuth();
  const [range, setRange] = useState(() =>
    createRangeState({ radiusKm: DEFAULT_RADIUS_KM, days: DEFAULT_DAYS })
  );

  const {
    data: recommendations,
    error: recoError,
    isLoading: recoLoading,
    mutate: refetchRecommendations,
  } = useRecommendations(lostPostId, session?.access_token, range.applied);

  useEffect(() => {
    if (!session?.access_token || recommendations?.status !== "ready") return;
    void trackFunnelEvent(session.access_token, {
      name: "recommendation_viewed",
      lostPostId,
      properties: {
        count: recommendations.items?.length ?? 0,
        radiusKm: range.applied.radiusKm,
        days: range.applied.days,
      },
    });
  }, [
    session?.access_token,
    recommendations?.status,
    recommendations?.items?.length,
    lostPostId,
    range.applied.radiusKm,
    range.applied.days,
  ]);

  const calculatedAtLabel =
    recommendations?.calculatedAt && recommendations.status === "ready"
      ? new Date(recommendations.calculatedAt).toLocaleString("ko-KR", {
          timeZone: "Asia/Seoul",
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <section aria-label="추천 제보" className="mt-2">
      <details className="border-border-subtle bg-surface mb-6 rounded-xl border shadow-sm">
        <summary className="focus-visible:outline-action-primary flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
          <Text variant="caption" color="caption">
            탐색 범위 · 반경 {range.applied.radiusKm}km · {range.applied.days}일
          </Text>
          <span className="text-caption shrink-0 select-none" aria-hidden>
            ▼
          </span>
        </summary>
        <div className="border-t border-gray-200 px-4 py-3 dark:border-gray-700">
          <ScrollablePanel variant="panel" className="space-y-3 pr-0.5">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
              <label className="flex items-center gap-2">
                <Text variant="caption" color="caption" className="shrink-0">
                  반경
                </Text>
                <select
                  value={range.draft.radiusKm}
                  onChange={(e) =>
                    setRange((prev) =>
                      updateDraftRange(prev, {
                        radiusKm: Number(e.target.value),
                      })
                    )
                  }
                  className="border-border-subtle focus:ring-action-primary h-11 min-h-11 min-w-[5.5rem] rounded-xl border bg-transparent px-3 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                >
                  {RADIUS_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}km
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex items-center gap-2">
                <Text variant="caption" color="caption" className="shrink-0">
                  기간
                </Text>
                <select
                  value={range.draft.days}
                  onChange={(e) =>
                    setRange((prev) =>
                      updateDraftRange(prev, {
                        days: Number(e.target.value),
                      })
                    )
                  }
                  className="border-border-subtle focus:ring-action-primary h-11 min-h-11 min-w-[5.5rem] rounded-xl border bg-transparent px-3 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                >
                  {DAYS_OPTIONS.map((v) => (
                    <option key={v} value={v}>
                      {v}일
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <Button
              variant="secondary"
              className="h-11 min-h-11 w-full py-0 text-sm"
              onClick={() => setRange(applyDraftRange)}
            >
              적용
            </Button>
          </ScrollablePanel>
        </div>
      </details>

      <div className="mb-3 flex flex-wrap items-end gap-2">
        {calculatedAtLabel ? (
          <Text
            variant="caption"
            color="caption"
            className="text-xs leading-none"
          >
            {calculatedAtLabel} 기준
          </Text>
        ) : null}
        <button
          type="button"
          className="text-text-caption hover:text-text-sub focus-visible:outline-action-primary ml-auto inline-flex min-h-11 min-w-11 items-end justify-center pb-0.5 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          onClick={() => refetchRecommendations()}
          aria-label="새로고침"
        >
          <Icon name="refresh" size={18} />
        </button>
      </div>

      {recoError ? (
        <div className="border-border-subtle mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <Text variant="caption" color="caption">
            비슷한 제보를 불러오는 중 오류가 났습니다.
          </Text>
        </div>
      ) : recoLoading || recommendations?.status === "pending" ? (
        <div className="border-border-subtle rounded-xl border p-6 text-center">
          <Text variant="body" color="caption">
            비슷한 제보를 정리하고 있습니다...
          </Text>
        </div>
      ) : recommendations?.status === "ready" &&
        (!recommendations.items || recommendations.items.length === 0) ? (
        <div className="border-border-subtle rounded-xl border p-6 text-center">
          <Text variant="body" color="caption">
            이 탐색 범위에는 아직 볼 목격 제보가 없습니다.
          </Text>
        </div>
      ) : (
        <ScrollablePanel variant="results" className="flex flex-col gap-4">
          {recommendations?.items?.map((item) => (
            <RecommendationCard
              key={item.sightingId}
              item={item}
              lostPostId={lostPostId}
              onFeedbackChange={refetchRecommendations}
              accessToken={session?.access_token}
            />
          ))}
        </ScrollablePanel>
      )}
    </section>
  );
}

export default function RecommendPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <Container className="py-8">
            <Text variant="caption" color="caption">
              로딩 중...
            </Text>
          </Container>
        }
      >
        <RecommendContent />
      </Suspense>
    </AuthGuard>
  );
}
