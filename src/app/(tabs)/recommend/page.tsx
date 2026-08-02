"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostCaseCarousel } from "@/features/lost-posts/components/LostCaseCarousel";
import { useLostPost } from "@/features/lost-posts/hooks/useLostPost";
import { useMyLostPosts } from "@/features/lost-posts/hooks/useMyLostPosts";
import { StatusBadge } from "@/features/lost-posts/components/StatusBadge";
import { createClient } from "@/shared/supabase/client";
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
  const lostPostId = searchParams.get("lostPostId");
  const {
    items: lostPosts,
    loading,
    refreshing,
    error: listError,
    reload: reloadLostPosts,
  } = useMyLostPosts();

  if (!lostPostId) {
    return (
      <Container className="py-8">
        <header className="mb-8">
          <Text as="h1" variant="title" className="text-2xl">
            비슷한 제보 찾기
          </Text>
          <Text variant="body" color="sub" className="mt-1">
            유실글을 고르면 가능성이 높은 목격 제보를 모아 보여드려요.
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
          <div className="border-border-subtle bg-surface rounded-2xl border border-dashed p-8 text-center shadow-sm">
            <Text variant="body" color="caption" className="mb-4 block">
              등록된 유실글이 없습니다.
            </Text>
            <Link href="/my/lost-posts/new">
              <Button variant="primary">유실글 올리기</Button>
            </Link>
          </div>
        ) : (
          <LostCaseCarousel
            items={lostPosts}
            refreshing={refreshing}
            heading="유실글 선택"
            primaryAction="recommend"
          />
        )}
      </Container>
    );
  }

  return <RecommendWithLostPost lostPostId={lostPostId} />;
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

  const { data: post, isLoading, error } = useLostPost(lostPostId);
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

  const client = createClient();
  const storageRef = client?.storage?.from("lost");
  const coverUrl =
    post && storageRef
      ? storageRef.getPublicUrl(post.cover_photo_key).data.publicUrl
      : "";
  const lostAt = post?.lost_at
    ? new Date(post.lost_at).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

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
    <Container className="py-8">
      <BackLink href="/recommend">다른 유실글 선택</BackLink>

      <header className="mb-6">
        <Text as="h1" variant="title" className="text-2xl">
          비슷한 제보 찾기
        </Text>
        <Text variant="body" color="sub" className="mt-1">
          거리·시각·특징을 바탕으로 먼저 볼 제보를 정리했어요.
        </Text>
      </header>

      {isLoading ? (
        <div className="border-border-subtle mb-6 rounded-2xl border p-4">
          <Text variant="caption" color="caption">
            로딩 중...
          </Text>
        </div>
      ) : error || !post ? (
        <div className="border-border-subtle mb-6 rounded-2xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
          <Text variant="caption" color="caption">
            유실글을 찾을 수 없습니다. 다른 유실글을 선택해 주세요.
          </Text>
        </div>
      ) : (
        <div className="border-border-subtle relative mb-6 rounded-2xl border bg-white p-4 shadow-sm">
          <Text variant="caption" color="caption" className="mb-2 block">
            선택된 유실글
          </Text>
          <Link
            href={`/my/lost-posts/${post.id}`}
            className="flex gap-4 rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          >
            <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              {coverUrl ? (
                <Image
                  src={coverUrl}
                  alt=""
                  fill
                  sizes="64px"
                  className="object-cover"
                />
              ) : (
                <div className="from-accent-warm/25 via-surface-soft to-primary-soft/40 absolute inset-0 bg-gradient-to-br" />
              )}
            </div>
            <div className="min-w-0 flex-1">
              <StatusBadge status={post.status} size="sm" className="mb-1" />
              <Text variant="body" className="font-medium">
                {post.pet_name?.trim() || "이름 미입력"}
              </Text>
              {lostAt ? (
                <Text variant="caption" color="caption" className="block">
                  유실 시각 {lostAt}
                </Text>
              ) : null}
            </div>
          </Link>
        </div>
      )}

      {error || !post ? null : (
        <>
          <details className="border-border-subtle bg-surface mb-6 rounded-xl border shadow-sm">
            <summary className="focus-visible:outline-action-primary flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm focus-visible:outline-2 focus-visible:outline-offset-2 [&::-webkit-details-marker]:hidden">
              <Text variant="caption" color="caption">
                탐색 범위 · 반경 {range.applied.radiusKm}km ·{" "}
                {range.applied.days}일
              </Text>
              <span className="text-caption shrink-0 select-none" aria-hidden>
                ▼
              </span>
            </summary>
            <div className="border-t border-gray-200 px-4 pt-3 pb-4 dark:border-gray-700">
              <ScrollablePanel variant="panel" className="pr-0.5">
                <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                  <label className="flex items-center gap-1.5">
                    <Text variant="caption" color="caption">
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
                      className="border-border-subtle focus:ring-action-primary min-h-11 min-w-0 rounded-xl border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                    >
                      {RADIUS_OPTIONS.map((v) => (
                        <option key={v} value={v}>
                          {v}km
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-1.5">
                    <Text variant="caption" color="caption">
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
                      className="border-border-subtle focus:ring-action-primary min-h-11 min-w-0 rounded-xl border bg-transparent px-3 py-2 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
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
                  variant="primary"
                  className="min-h-11 w-full text-sm"
                  onClick={() => setRange(applyDraftRange)}
                >
                  적용
                </Button>
              </ScrollablePanel>
            </div>
          </details>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            {calculatedAtLabel ? (
              <Text variant="caption" color="caption">
                {calculatedAtLabel} 기준
              </Text>
            ) : null}
            <Button
              variant="secondary"
              className="ml-auto min-h-11 text-sm"
              onClick={() => refetchRecommendations()}
            >
              새로고침
            </Button>
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
            <div className="flex flex-col gap-4">
              {recommendations?.items?.map((item) => (
                <RecommendationCard
                  key={item.sightingId}
                  item={item}
                  lostPostId={lostPostId}
                  onFeedbackChange={refetchRecommendations}
                  accessToken={session?.access_token}
                />
              ))}
            </div>
          )}
        </>
      )}
    </Container>
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
