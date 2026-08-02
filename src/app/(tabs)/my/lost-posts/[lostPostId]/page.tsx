"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Suspense, useEffect, useState } from "react";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Toast } from "@/shared/ui/Toast";
import { ScrollablePanel } from "@/shared/ui/ScrollablePanel";
import { BackLink } from "@/shared/ui/BackLink";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useLostPost } from "@/features/lost-posts/hooks/useLostPost";
import { StatusBadge } from "@/features/lost-posts/components/StatusBadge";
import { createClient } from "@/shared/supabase/client";
import {
  DOG_BREEDS,
  getBreedLabel,
  SPECIES_UNKNOWN,
} from "@/features/sightings/constants/breeds";
import {
  SIZE_LABELS,
  SIZE_VALUES,
  type SizeValue,
} from "@/shared/constants/traitSizes";
import { TRAIT_TAGS } from "@/shared/constants/traitTags";
import { cn } from "@/shared/lib/cn";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import { LostPostStatusHistory } from "@/features/lost-posts/components/LostPostStatusHistory";
import { ReportBlockSheet } from "@/features/moderation/components/ReportBlockSheet";
import { invalidateMyLostPostsCache } from "@/features/lost-posts/hooks/useMyLostPosts";

const MAX_TAG_EDIT = 8;

const SELECT_CHEVRON =
  "bg-[url('data:image/svg+xml,%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 fill=%27none%27 viewBox=%270 0 24 24%27 stroke=%27%236b7280%27%3E%3Cpath stroke-linecap=%27round%27 stroke-linejoin=%27round%27 stroke-width=%272%27 d=%27m19 9-7 7-7-7%27/%3E%3C/svg%3E')]";

const fieldInputClass =
  "border-border-subtle focus:border-action-primary focus:ring-action-primary/20 min-h-11 w-full rounded-xl border bg-white px-4 py-3 text-[15px] text-text-main shadow-sm outline-none transition-all placeholder:text-text-caption focus:ring-2";

const fieldSelectClass = cn(
  fieldInputClass,
  "cursor-pointer appearance-none bg-no-repeat bg-[length:1.25rem] bg-[right_0.75rem_center] pr-10",
  SELECT_CHEVRON
);

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
  const [showEditModal, setShowEditModal] = useState(false);
  const [editSubmitting, setEditSubmitting] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [editForm, setEditForm] = useState({
    petName: "",
    traitColor: "",
    traitSize: "",
    traitSpecies: "",
    traitTags: [] as string[],
    note: "",
    status: "searching" as "searching" | "found" | "closed",
  });
  const openEditRequested = searchParams.get("edit") === "1";

  useEffect(() => {
    if (!openEditRequested || !item || showEditModal) return;
    setEditForm({
      petName: item.pet_name ?? "",
      traitColor: item.trait_color ?? "",
      traitSize:
        item.trait_size &&
        ["small", "medium", "large", "unknown"].includes(item.trait_size)
          ? item.trait_size
          : item.trait_size === "소"
            ? "small"
            : item.trait_size === "중"
              ? "medium"
              : item.trait_size === "대"
                ? "large"
                : "unknown",
      traitSpecies: item.trait_species ?? SPECIES_UNKNOWN,
      traitTags: Array.isArray((item as { trait_tags?: string[] }).trait_tags)
        ? (item as { trait_tags: string[] }).trait_tags
        : [],
      note: item.note ?? "",
      status: item.status,
    });
    setShowEditModal(true);
  }, [openEditRequested, item, showEditModal]);

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

  const openEditModal = () => {
    if (!item) return;
    setEditForm({
      petName: item.pet_name ?? "",
      traitColor: item.trait_color ?? "",
      traitSize:
        item.trait_size &&
        ["small", "medium", "large", "unknown"].includes(item.trait_size)
          ? item.trait_size
          : item.trait_size === "소"
            ? "small"
            : item.trait_size === "중"
              ? "medium"
              : item.trait_size === "대"
                ? "large"
                : "unknown",
      traitSpecies: item.trait_species ?? SPECIES_UNKNOWN,
      traitTags: Array.isArray((item as { trait_tags?: string[] }).trait_tags)
        ? (item as { trait_tags: string[] }).trait_tags
        : [],
      note: item.note ?? "",
      status: item.status,
    });
    setShowEditModal(true);
  };

  const handleEditSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!lostPostId || !session?.access_token || editSubmitting) return;
    setEditSubmitting(true);
    try {
      const res = await fetch(`/api/v1/lost-posts/${lostPostId}`, {
        method: "PATCH",
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({
          petName: editForm.petName.trim(),
          traitColor: editForm.traitColor.trim() || undefined,
          traitSize: editForm.traitSize,
          traitSpecies: editForm.traitSpecies,
          traitTags: editForm.traitTags.length ? editForm.traitTags : undefined,
          note: editForm.note.trim() || undefined,
          status: editForm.status,
        }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok || !payload?.success) {
        throw new Error(
          payload?.error?.message ?? "수정에 실패했습니다."
        );
      }
      setToast({ message: "수정되었습니다.", type: "success" });
      setShowEditModal(false);
      invalidateMyLostPostsCache();
      await mutate();
      if (openEditRequested) {
        router.replace(`/my/lost-posts/${lostPostId}`);
      }
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
        type: "error",
      });
    } finally {
      setEditSubmitting(false);
    }
  };

  const client = createClient();
  const ref = client?.storage?.from("lost");
  const coverUrl = ref
    ? ref.getPublicUrl(item.cover_photo_key).data.publicUrl
    : "";
  const lostAt = item.lost_at
    ? new Date(item.lost_at).toLocaleString("ko-KR", {
        timeZone: "Asia/Seoul",
      })
    : "";
  const colorSize = [item.trait_color, item.trait_size]
    .filter(Boolean)
    .join(" · ");
  const traitSpecies = item.trait_species?.trim() || null;

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
        <button
          type="button"
          onClick={openEditModal}
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
        </button>
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
              <Button
                type="button"
                variant="quiet"
                className="shrink-0"
                onClick={async () => {
                  const shareUrl = `${window.location.origin}/share/lost-posts/${item.id}`;
                  try {
                    if (navigator.share) {
                      await navigator.share({
                        title: "PinPaw 실종 제보",
                        text: "정확한 위치와 메모는 포함되지 않습니다.",
                        url: shareUrl,
                      });
                    } else {
                      await navigator.clipboard.writeText(shareUrl);
                      setToast({
                        message: "공유 링크를 복사했습니다.",
                        type: "success",
                      });
                    }
                  } catch {
                    setToast({
                      message: "공유에 실패했습니다.",
                      type: "error",
                    });
                  }
                }}
              >
                공유
              </Button>
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
              <DetailField
                label="추가 설명"
                value={item.note}
                multiline
              />
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

          <div className="border-border-subtle space-y-2 border-t pt-4">
            <Text variant="body" color="main" className="font-semibold">
              상태 이력
            </Text>
            <LostPostStatusHistory lostPostId={item.id} />
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

      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-title"
        >
          <div className="surface-light flex max-h-[min(85vh,36rem)] w-full max-w-sm flex-col overflow-hidden rounded-2xl border border-border-subtle bg-white shadow-xl">
            <div className="border-border-subtle shrink-0 border-b px-5 pt-5 pb-3">
              <Text
                as="h2"
                variant="title"
                color="main"
                id="edit-title"
                className="block"
              >
                유실글 수정
              </Text>
            </div>
            <form
              onSubmit={handleEditSubmit}
              className="flex min-h-0 flex-1 flex-col"
            >
              <ScrollablePanel
                variant="sheet"
                className="min-h-0 flex-1 space-y-4 px-5 py-4"
              >
                <div className="space-y-1.5">
                  <label className="text-text-main block text-sm font-semibold">
                    상태
                  </label>
                  <select
                    value={editForm.status}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        status: e.target.value as
                          | "searching"
                          | "found"
                          | "closed",
                      }))
                    }
                    className={fieldSelectClass}
                  >
                    <option value="searching">찾는 중</option>
                    <option value="found">찾았어요</option>
                    <option value="closed">마감</option>
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-text-main block text-sm font-semibold">
                    강아지 이름 <span className="text-action-primary">*</span>
                  </label>
                  <input
                    type="text"
                    value={editForm.petName}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        petName: e.target.value,
                      }))
                    }
                    placeholder="예: 초코, 망고"
                    className={fieldInputClass}
                    required
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-text-main block text-sm font-semibold">
                    색상
                  </label>
                  <input
                    type="text"
                    value={editForm.traitColor}
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        traitColor: e.target.value,
                      }))
                    }
                    placeholder="예: 갈색, 흰색 얼룩"
                    maxLength={100}
                    className={fieldInputClass}
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-text-main block text-sm font-semibold">
                    크기
                  </label>
                  <select
                    value={
                      SIZE_VALUES.includes(editForm.traitSize as SizeValue)
                        ? editForm.traitSize
                        : "unknown"
                    }
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        traitSize: e.target.value,
                      }))
                    }
                    className={fieldSelectClass}
                  >
                    {SIZE_VALUES.map((v) => (
                      <option key={v} value={v}>
                        {SIZE_LABELS[v as SizeValue]}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1.5">
                  <label className="text-text-main block text-sm font-semibold">
                    종
                  </label>
                  <select
                    value={
                      DOG_BREEDS.includes(
                        editForm.traitSpecies as (typeof DOG_BREEDS)[number]
                      )
                        ? editForm.traitSpecies
                        : SPECIES_UNKNOWN
                    }
                    onChange={(e) =>
                      setEditForm((prev) => ({
                        ...prev,
                        traitSpecies: e.target.value,
                      }))
                    }
                    className={fieldSelectClass}
                  >
                    {DOG_BREEDS.map((b) => (
                      <option key={b} value={b}>
                        {getBreedLabel(b)}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="space-y-2">
                  <Text variant="caption" color="caption" className="block">
                    특이사항 (최대 {MAX_TAG_EDIT}개)
                  </Text>
                  <div className="flex flex-wrap gap-2">
                    {TRAIT_TAGS.map((tag) => {
                      const selected = editForm.traitTags.includes(tag.id);
                      const disabled =
                        !selected && editForm.traitTags.length >= MAX_TAG_EDIT;
                      return (
                        <button
                          key={tag.id}
                          type="button"
                          onClick={() => {
                            if (selected) {
                              setEditForm((prev) => ({
                                ...prev,
                                traitTags: prev.traitTags.filter(
                                  (id) => id !== tag.id
                                ),
                              }));
                            } else if (!disabled) {
                              setEditForm((prev) => ({
                                ...prev,
                                traitTags: [...prev.traitTags, tag.id],
                              }));
                            }
                          }}
                          disabled={disabled}
                          aria-pressed={selected}
                          className={cn(
                            "focus-visible:outline-action-primary min-h-11 rounded-full px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2",
                            selected
                              ? "bg-action-primary text-action-on-primary"
                              : "bg-surface-soft text-text-sub hover:bg-accent-warm/20",
                            disabled && "cursor-not-allowed opacity-50"
                          )}
                        >
                          {tag.labelKo}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <label className="text-text-main block text-sm font-semibold">
                    추가 설명
                  </label>
                  <textarea
                    value={editForm.note}
                    onChange={(e) =>
                      setEditForm((prev) => ({ ...prev, note: e.target.value }))
                    }
                    placeholder="상세 정보를 입력해주세요"
                    rows={4}
                    className={cn(fieldInputClass, "resize-none py-3")}
                  />
                </div>
              </ScrollablePanel>
              <div className="border-border-subtle flex shrink-0 gap-3 border-t bg-white px-5 py-4">
                <Button
                  type="button"
                  variant="secondary"
                  className="min-h-11 flex-1"
                  onClick={() => setShowEditModal(false)}
                >
                  취소
                </Button>
                <Button
                  type="submit"
                  variant="primary"
                  className="min-h-11 flex-1"
                  isLoading={editSubmitting}
                  disabled={editSubmitting}
                >
                  저장
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}

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
