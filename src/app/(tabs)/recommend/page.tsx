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

function RecommendWithLostPost({ lostPostId }: { lostPostId: string }) {
  const { data: post, isLoading, error } = useLostPost(lostPostId);
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
            유실글을 불러올 수 없습니다.
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

      <Text variant="caption" color="caption" className="mb-4 block">
        이 유실글과 유사한 목격 제보입니다. (준비 중)
      </Text>
      <div className="flex flex-col gap-4">
        {[1, 2, 3].map((item) => (
          <div
            key={item}
            className="border-border-subtle rounded-xl border p-5"
          >
            <Text variant="body" className="font-bold">
              추천 제보 {item}
            </Text>
            <Text variant="caption" className="mb-3">
              가능성이 높은 제보입니다.
            </Text>
            <Button variant="secondary" className="w-full py-2 text-sm">
              상세보기
            </Button>
          </div>
        ))}
      </div>
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
