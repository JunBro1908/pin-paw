"use client";

import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { LostPostCard } from "@/features/lost-posts/components/LostPostCard";
import { useLostPost } from "@/features/lost-posts/hooks/useLostPost";
import { StatusBadge } from "@/features/lost-posts/components/StatusBadge";
import { createClient } from "@/shared/supabase/client";
import { useEffect, useState } from "react";
import type { LostPostItem } from "@/features/lost-posts/model/types";
import { useRecommendations } from "@/features/recommendations/hooks/useRecommendations";
import { RecommendationCard } from "@/features/recommendations/components/RecommendationCard";

function RecommendContent() {
  const searchParams = useSearchParams();
  const lostPostId = searchParams.get("lostPostId");
  const { session } = useAuth();
  const [lostPosts, setLostPosts] = useState<LostPostItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!session?.access_token) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    fetch("/api/v1/lost-posts?limit=50", {
      credentials: "include",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => (res.ok ? res.json() : { success: false, data: [] }))
      .then((json) => {
        if (!cancelled && json.success && Array.isArray(json.data)) {
          setLostPosts(json.data);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session?.access_token]);

  // 유실글을 선택하지 않았을 때: 내 유실글 목록을 보여주고, 선택하면 해당 유실글의 추천으로 이동
  if (!lostPostId) {
    return (
      <Container className="py-10">
        <Text variant="title" className="mb-2">
          추천
        </Text>
        <Text variant="caption" color="caption" className="mb-6 block">
          유실글을 선택하면 해당 유실글에 맞는 추천 제보를 볼 수 있습니다.
        </Text>
        {loading ? (
          <Text variant="caption" color="caption">
            로딩 중...
          </Text>
        ) : lostPosts.length === 0 ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-8 text-center dark:border-gray-700 dark:bg-gray-800/50">
            <Text variant="body" color="caption" className="mb-4 block">
              등록된 유실글이 없습니다.
            </Text>
            <Link href="/my">
              <Button variant="primary">내 정보에서 유실글 등록하기</Button>
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            <Text variant="body" className="font-medium">
              유실글 선택
            </Text>
            <ul className="space-y-4">
              {lostPosts.map((item) => (
                <li key={item.id}>
                  <LostPostCard
                    item={item}
                    href={`/recommend?lostPostId=${item.id}`}
                  />
                </li>
              ))}
            </ul>
          </div>
        )}
      </Container>
    );
  }

  // 유실글 선택됨: 선택된 유실글 미리보기 + 해당 추천 목록
  return <RecommendWithLostPost lostPostId={lostPostId} />;
}

const RADIUS_OPTIONS = [1, 2, 5, 8, 10, 20, 50, 100] as const;
const DAYS_OPTIONS = [1, 3, 7, 8, 14, 30] as const;
const TOP_K_OPTIONS = [5, 10, 20, 30] as const;

const DEFAULT_RADIUS_KM = 8;
const DEFAULT_DAYS = 8;
const DEFAULT_TOP_K = 10;

function RecommendWithLostPost({ lostPostId }: { lostPostId: string }) {
  const { session } = useAuth();
  const [radiusKm, setRadiusKm] = useState(DEFAULT_RADIUS_KM);
  const [days, setDays] = useState(DEFAULT_DAYS);
  const [topK, setTopK] = useState(DEFAULT_TOP_K);

  const { data: post, isLoading, error } = useLostPost(lostPostId);
  const {
    data: recommendations,
    error: recoError,
    isLoading: recoLoading,
    mutate: refetchRecommendations,
  } = useRecommendations(lostPostId, session?.access_token, {
    radiusKm,
    days,
    topK,
  });

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
          month: "short",
          day: "numeric",
          hour: "2-digit",
          minute: "2-digit",
        })
      : null;

  return (
    <Container className="py-10">
      <Link
        href="/recommend"
        className="text-primary mb-4 inline-block text-sm font-medium"
      >
        ← 다른 유실글 선택
      </Link>

      <Text variant="title" className="mb-3">
        추천 제보
      </Text>

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
        <div className="border-border-subtle bg-surface mb-6 rounded-2xl border p-4 shadow-sm">
          <Text variant="caption" color="caption" className="mb-2 block">
            선택된 유실글
          </Text>
          <div className="flex gap-4">
            <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl bg-gray-100">
              {coverUrl ? (
                <img
                  src={coverUrl}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl">
                  📷
                </div>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <StatusBadge status={post.status} size="sm" className="mb-1" />
              <Text variant="body" className="font-medium">
                {lostAt}
              </Text>
              {[post.trait_color, post.trait_size, post.trait_species].filter(
                Boolean
              ).length > 0 && (
                <Text
                  variant="caption"
                  color="caption"
                  className="block truncate"
                >
                  {[post.trait_color, post.trait_size, post.trait_species]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              )}
            </div>
          </div>
        </div>
      )}

      {error || !post ? null : (
        <>
          <details className="border-border-subtle bg-surface mb-6 rounded-xl border shadow-sm">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-4 py-3 text-sm [&::-webkit-details-marker]:hidden">
              <Text variant="caption" color="caption">
                추천 조건: 반경 {radiusKm}km · {days}일 · {topK}개
              </Text>
              <span className="text-caption shrink-0 select-none" aria-hidden>
                ▼
              </span>
            </summary>
            <div className="border-t border-gray-200 px-4 pt-3 pb-4 dark:border-gray-700">
              <div className="mb-3 flex flex-wrap items-center gap-x-4 gap-y-2">
                <label className="flex items-center gap-1.5">
                  <Text variant="caption" color="caption">
                    반경
                  </Text>
                  <select
                    value={radiusKm}
                    onChange={(e) => setRadiusKm(Number(e.target.value))}
                    className="border-border-subtle focus:ring-primary min-w-0 rounded-md border bg-transparent px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
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
                    value={days}
                    onChange={(e) => setDays(Number(e.target.value))}
                    className="border-border-subtle focus:ring-primary min-w-0 rounded-md border bg-transparent px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                  >
                    {DAYS_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}일
                      </option>
                    ))}
                  </select>
                </label>
                <label className="flex items-center gap-1.5">
                  <Text variant="caption" color="caption">
                    개수
                  </Text>
                  <select
                    value={topK}
                    onChange={(e) => setTopK(Number(e.target.value))}
                    className="border-border-subtle focus:ring-primary min-w-0 rounded-md border bg-transparent px-2.5 py-1.5 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
                  >
                    {TOP_K_OPTIONS.map((v) => (
                      <option key={v} value={v}>
                        {v}개
                      </option>
                    ))}
                  </select>
                </label>
              </div>
              <Button
                variant="primary"
                className="w-full py-2 text-sm"
                onClick={() => refetchRecommendations()}
              >
                조회
              </Button>
            </div>
          </details>

          <div className="mb-4 flex flex-wrap items-center gap-2">
            <Text variant="caption" color="caption">
              이 유실글과 유사한 목격 제보입니다.
            </Text>
            {calculatedAtLabel && (
              <Text variant="caption" color="caption">
                · {calculatedAtLabel} 기준
              </Text>
            )}
            <Button
              variant="secondary"
              className="ml-auto py-1.5 text-sm"
              onClick={() => refetchRecommendations()}
            >
              새로고침
            </Button>
          </div>

          {recoError ? (
            <div className="border-border-subtle mb-4 rounded-xl border border-amber-200 bg-amber-50/50 p-4 dark:border-amber-800 dark:bg-amber-900/20">
              <Text variant="caption" color="caption">
                추천을 불러오는 중 오류가 났습니다.
              </Text>
            </div>
          ) : recoLoading || recommendations?.status === "pending" ? (
            <div className="border-border-subtle rounded-xl border p-6 text-center">
              <Text variant="body" color="caption">
                추천 준비중...
              </Text>
            </div>
          ) : recommendations?.status === "ready" &&
            (!recommendations.items || recommendations.items.length === 0) ? (
            <div className="border-border-subtle rounded-xl border p-6 text-center">
              <Text variant="body" color="caption">
                아직 유사한 목격 제보가 없습니다.
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
      <RecommendContent />
    </AuthGuard>
  );
}
