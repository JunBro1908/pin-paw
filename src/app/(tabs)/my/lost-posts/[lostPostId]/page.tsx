"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { createClient } from "@/shared/supabase/client";
import type { LostPostItem } from "@/features/lost-posts/model/types";

const statusLabel: Record<string, string> = {
  searching: "찾는 중",
  found: "찾았어요",
  closed: "마감",
};

function LostPostDetailContent() {
  const params = useParams();
  const router = useRouter();
  const { session } = useAuth();
  const lostPostId = params.lostPostId as string;
  const [item, setItem] = useState<LostPostItem | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!lostPostId || !session?.access_token) {
      setLoading(false);
      return;
    }
    fetch(`/api/v1/lost-posts/${lostPostId}`, {
      credentials: "include",
      headers: { Authorization: `Bearer ${session.access_token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error("불러올 수 없습니다.");
        return res.json();
      })
      .then((json) => {
        if (json.success) setItem(json.data);
      })
      .catch((e) => setError(e instanceof Error ? e.message : "오류"))
      .finally(() => setLoading(false));
  }, [lostPostId, session?.access_token]);

  if (loading) {
    return (
      <Container className="py-8">
        <Text variant="body">로딩 중...</Text>
      </Container>
    );
  }
  if (error || !item) {
    return (
      <Container className="py-8">
        <Text variant="body" color="error">
          {error ?? "유실글을 찾을 수 없습니다."}
        </Text>
        <Button
          variant="secondary"
          className="mt-4"
          onClick={() => router.push("/my/lost-posts")}
        >
          목록으로
        </Button>
      </Container>
    );
  }

  const client = createClient();
  const ref = client?.storage?.from("lost");
  const coverUrl = ref
    ? ref.getPublicUrl(item.cover_photo_key).data.publicUrl
    : "";
  const lostAt = item.lost_at
    ? new Date(item.lost_at).toLocaleString("ko-KR")
    : "";
  const traits = [item.trait_color, item.trait_size, item.trait_state]
    .filter(Boolean)
    .join(" · ");

  return (
    <Container className="py-8">
      <Link
        href="/my/lost-posts"
        className="text-primary mb-6 inline-block text-sm font-medium"
      >
        ← 목록으로
      </Link>
      <div className="mb-4 overflow-hidden rounded-2xl bg-gray-100">
        {coverUrl ? (
          <img
            src={coverUrl}
            alt="대표 사진"
            className="aspect-[4/3] w-full object-cover"
          />
        ) : (
          <div className="flex aspect-[4/3] w-full items-center justify-center text-4xl">
            📷
          </div>
        )}
      </div>
      <span className="bg-primary-soft text-primary mb-2 inline-block rounded-full px-3 py-1 text-sm font-medium">
        {statusLabel[item.status] ?? item.status}
      </span>
      <Text variant="title" className="mb-2">
        유실 일시
      </Text>
      <Text variant="body" className="mb-6">
        {lostAt}
      </Text>
      {traits ? (
        <>
          <Text variant="body" className="font-bold">
            특징
          </Text>
          <Text variant="body" className="mb-6">
            {traits}
          </Text>
        </>
      ) : null}
      <Link href="/my/lost-posts">
        <Button variant="secondary" className="w-full">
          목록으로 돌아가기
        </Button>
      </Link>
    </Container>
  );
}

export default function LostPostDetailPage() {
  return (
    <AuthGuard>
      <LostPostDetailContent />
    </AuthGuard>
  );
}
