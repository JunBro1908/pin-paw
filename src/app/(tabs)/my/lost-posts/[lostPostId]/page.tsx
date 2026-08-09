"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Toast } from "@/shared/ui/Toast";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useLostPost } from "@/features/lost-posts/hooks/useLostPost";
import { StatusBadge } from "@/features/lost-posts/components/StatusBadge";
import { getLostPostCoverUrl } from "@/features/lost-posts/lib/lost-post-cover";
import { cn } from "@/shared/lib/cn";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import { ReportBlockSheet } from "@/features/moderation/components/ReportBlockSheet";
import { ShareLostPostButton } from "@/features/lost-posts/components/ShareLostPostButton";
import { formatDogSizeLabel } from "@/shared/constants/traitSizes";
import { formatSeoulLostDateTime } from "@/shared/lib/date";

function DetailField({
  label,
  value,
  multiline = false,
}: {
  label: string;
  value: string;
  multiline?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Text variant="caption" color="caption" className="block font-medium">
        {label}
      </Text>
      <Text
        variant="body"
        color="main"
        className={cn(
          "block leading-snug",
          multiline && "leading-relaxed whitespace-pre-wrap"
        )}
      >
        {value}
      </Text>
    </div>
  );
}

function LostPostDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session } = useAuth();
  const lostPostId = (params.lostPostId as string) ?? null;
  const { data: item, error, isLoading, mutate } = useLostPost(lostPostId);
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);
  const [pendingStatus, setPendingStatus] = useState<string | null>(null);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const openEditRequested = searchParams.get("edit") === "1";

  useEffect(() => {
    if (!openEditRequested || !lostPostId) return;
    router.replace(`/my/lost-posts/${lostPostId}/edit`);
  }, [openEditRequested, lostPostId, router]);

  const updateStatus = async (newStatus: "found" | "closed") => {
    if (!lostPostId || !session?.access_token) return;
    setPendingStatus(newStatus);
    try {
      const res = await fetch(`/api/v1/lost-posts/${lostPostId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "상태 변경에 실패했습니다.");
      }
      if (newStatus === "closed" || newStatus === "found") {
        void trackFunnelEvent(session.access_token, {
          name: "lost_post_closed",
          lostPostId,
          properties: { status: newStatus },
        });
      }
      setToast({
        message:
          newStatus === "found"
            ? "찾았어요로 변경되었습니다."
            : "마감되었습니다.",
        type: "success",
      });
      await mutate();
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setPendingStatus(null);
    }
  };

  const handleDelete = async () => {
    if (!lostPostId || !session?.access_token) return;
    try {
      const res = await fetch(`/api/v1/lost-posts/${lostPostId}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "삭제에 실패했습니다.");
      }
      setToast({ message: "삭제되었습니다.", type: "success" });
      router.push("/my");
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
        type: "error",
      });
      setShowDeleteConfirm(false);
    }
  };

  if (isLoading) {
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
          onClick={() => router.push("/my")}
        >
          목록으로
        </Button>
      </Container>
    );
  }

  const coverUrl = getLostPostCoverUrl(item.cover_photo_key);
  const lostAt = formatSeoulLostDateTime(item.lost_at);
  const colorSize = [item.trait_color?.trim(), formatDogSizeLabel(item.trait_size)]
    .filter((value): value is string => Boolean(value && value !== "unknown" && value !== "모름"))
    .join(" · ");
  const traitSpecies = item.trait_species?.trim() || null;
  const editHref = `/my/lost-posts/${item.id}/edit`;

  return (
    <Container className="py-8">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex items-center justify-between gap-3">
        <BackLink href="/my" className="mb-0">
          내 정보
        </BackLink>
        <Link
          href={editHref}
          className="text-text-main hover:bg-surface-soft focus-visible:outline-action-primary inline-flex min-h-11 min-w-11 items-center justify-center rounded-xl focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
          aria-label="수정"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </Link>
      </div>

      <article className="surface-light border-border-subtle overflow-hidden rounded-2xl border bg-white shadow-sm">
        <div className="relative aspect-[4/3] overflow-hidden bg-gray-100">
          {coverUrl ? (
            <Image
              src={coverUrl}
              alt="대표 사진"
              fill
              sizes="(max-width: 768px) 100vw, 768px"
              className="object-cover"
            />
          ) : (
            <div
              className="from-accent-warm/25 via-surface-soft to-primary-soft/40 absolute inset-0 bg-gradient-to-br"
              aria-hidden
            />
          )}
        </div>

        <div className="space-y-5 p-4">
          <div className="flex items-center justify-between gap-3">
            <StatusBadge status={item.status} size="md" />
            {item.status === "searching" ? (
              <ShareLostPostButton
                lostPostId={item.id}
                petName={item.pet_name}
                onCopied={() =>
                  setToast({
                    message: "공유 링크를 복사했습니다.",
                    type: "success",
                  })
                }
                onError={() =>
                  setToast({
                    message: "공유에 실패했습니다.",
                    type: "error",
                  })
                }
              />
            ) : null}
          </div>

          <div className="space-y-4">
            <DetailField
              label="강아지 이름"
              value={item.pet_name?.trim() || "미입력"}
            />
            {lostAt ? <DetailField label="유실 일시" value={lostAt} /> : null}
            {colorSize ? (
              <DetailField label="색상 · 크기" value={colorSize} />
            ) : null}
            {traitSpecies ? (
              <DetailField label="종" value={traitSpecies} />
            ) : null}
            {item.note?.trim() ? (
              <DetailField label="추가 설명" value={item.note} multiline />
            ) : null}
          </div>

          <div className="space-y-3 pt-1">
            {item.status === "searching" ? (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                disabled={!!pendingStatus}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.confirm("찾았어요로 변경할까요?")
                  ) {
                    updateStatus("found");
                  }
                }}
              >
                {pendingStatus === "found" ? "변경 중..." : "찾았어요로 변경"}
              </Button>
            ) : null}
            {item.status === "found" ? (
              <Button
                variant="secondary"
                className="min-h-11 w-full"
                disabled={!!pendingStatus}
                onClick={() => {
                  if (
                    typeof window !== "undefined" &&
                    window.confirm("마감할까요?")
                  ) {
                    updateStatus("closed");
                  }
                }}
              >
                {pendingStatus === "closed" ? "변경 중..." : "마감하기"}
              </Button>
            ) : null}
            {item.status === "closed" ? (
              <Text variant="caption" color="caption">
                마감된 유실글입니다.
              </Text>
            ) : null}

            <Link href={`/recommend?lostPostId=${item.id}`} className="block">
              <Button variant="primary" className="min-h-11 w-full">
                추천 제보 보기
              </Button>
            </Link>
          </div>

          <div className="border-border-subtle border-t pt-4">
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(true)}
              className="text-text-caption hover:text-danger-text text-sm font-medium"
            >
              유실글 삭제
            </button>
          </div>
        </div>
      </article>

      {reportOpen ? (
        <ReportBlockSheet
          targetType="lost-post"
          targetId={item.id}
          onClose={() => setReportOpen(false)}
          onCompleted={(message) => setToast({ message, type: "success" })}
        />
      ) : null}

      {showDeleteConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-title"
        >
          <div className="surface-light border-border-subtle w-full max-w-sm rounded-2xl border bg-white p-6 shadow-xl">
            <Text
              as="h2"
              variant="title"
              color="main"
              id="delete-title"
              className="block"
            >
              이 유실글을 삭제할까요?
            </Text>
            <Text variant="caption" color="caption" className="mt-2 block">
              삭제하면 복구할 수 없습니다.
            </Text>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="min-h-11 flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                취소
              </Button>
              <Button
                variant="danger"
                className="min-h-11 flex-1"
                onClick={handleDelete}
              >
                삭제
              </Button>
            </div>
          </div>
        </div>
      )}
    </Container>
  );
}

export default function LostPostDetailPage() {
  return (
    <AuthGuard>
      <Suspense
        fallback={
          <Container className="py-8">
            <Text variant="body">로딩 중...</Text>
          </Container>
        }
      >
        <LostPostDetailContent />
      </Suspense>
    </AuthGuard>
  );
}
