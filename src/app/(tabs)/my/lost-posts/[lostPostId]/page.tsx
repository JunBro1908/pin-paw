"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import Image from "next/image";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Toast } from "@/shared/ui/Toast";
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
import { useState } from "react";
import { trackFunnelEvent } from "@/shared/lib/funnel-client";
import { LostPostStatusHistory } from "@/features/lost-posts/components/LostPostStatusHistory";
import { ReportBlockSheet } from "@/features/moderation/components/ReportBlockSheet";

const MAX_TAG_EDIT = 8;

function LostPostDetailContent() {
  const params = useParams();
  const router = useRouter();
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
    setEditForm({
      petName: item.pet_name ?? "",
      traitColor: item.trait_color ?? "",
      traitSize:
        item.trait_size && ["small", "medium", "large", "unknown"].includes(item.trait_size)
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
    if (!lostPostId || !session?.access_token) return;
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
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error?.message ?? "수정에 실패했습니다.");
      }
      setToast({ message: "수정되었습니다.", type: "success" });
      setShowEditModal(false);
      await mutate();
    } catch (e) {
      setToast({
        message: e instanceof Error ? e.message : "오류가 발생했습니다.",
        type: "error",
      });
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

      <div className="text-primary mb-6 flex items-center justify-between">
        <Link href="/my" className="text-sm font-medium">
          ← 목록으로
        </Link>
        <button
          type="button"
          onClick={openEditModal}
          className="rounded-full p-2 hover:bg-gray-100"
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
          >
            <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
            <path d="m15 5 4 4" />
          </svg>
        </button>
      </div>

      {/* 1. 사진 */}
      <div className="relative aspect-[4/3] overflow-hidden rounded-2xl bg-gray-100">
        {coverUrl ? (
          <Image
            src={coverUrl}
            alt="대표 사진"
            fill
            sizes="(max-width: 768px) 100vw, 768px"
            className="object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-4xl">
            📷
          </div>
        )}
      </div>

      <div className="border-border-subtle my-6 border-t dark:border-gray-700" />

      {/* 2. 내용 + 버튼 */}
      <div className="space-y-5">
        {/* 1 row: 상태 뱃지 + 안전한 공유 */}
        <div className="flex items-center justify-between gap-3">
          <StatusBadge status={item.status} size="md" />
          {item.status === "searching" ? (
            <Button
              type="button"
              variant="secondary"
              className="shrink-0 px-3 py-2 text-sm"
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

        {/* 강아지 이름 */}
        <div>
          <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
            강아지 이름
          </p>
          <p className="mt-0.5 text-[15px] leading-snug font-medium">
            {item.pet_name?.trim() || "미입력"}
          </p>
        </div>

        {/* 아래 줄부터: 유실 일시, 색상·크기(dot), 특징(memo) */}
        <div className="space-y-3">
          <div>
            <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
              유실 일시
            </p>
            <p className="mt-0.5 text-[15px] leading-snug">{lostAt}</p>
          </div>

          {colorSize ? (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                색상 · 크기
              </p>
              <p className="mt-0.5 text-[15px] leading-snug">{colorSize}</p>
            </div>
          ) : null}

          {traitSpecies ? (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                종
              </p>
              <p className="mt-0.5 text-[15px] leading-snug">{traitSpecies}</p>
            </div>
          ) : null}

          {item.note?.trim() ? (
            <div>
              <p className="text-sm font-medium text-gray-500 dark:text-gray-400">
                추가 설명
              </p>
              <p className="mt-0.5 text-[15px] leading-relaxed whitespace-pre-wrap text-gray-800 dark:text-gray-200">
                {item.note}
              </p>
            </div>
          ) : null}
        </div>

        {item.status === "searching" && (
          <Button
            variant="secondary"
            className="w-full"
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
        )}
        {item.status === "found" && (
          <Button
            variant="secondary"
            className="w-full"
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
        )}
        {item.status === "closed" && (
          <p className="text-sm text-gray-500 dark:text-gray-400">
            마감된 유실글입니다.
          </p>
        )}

        <Link href={`/recommend?lostPostId=${item.id}`} className="block">
          <Button variant="primary" className="w-full">
            이 유실글의 추천 제보 보기
          </Button>
        </Link>

        <div className="space-y-2 pt-2">
          <Text variant="body" className="font-semibold">
            상태 이력
          </Text>
          <LostPostStatusHistory lostPostId={item.id} />
        </div>
      </div>

      <div className="border-border-subtle my-6 border-t dark:border-gray-700" />

      {/* 3. 삭제 */}
      <div className="pt-1">
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-300"
        >
          유실글 삭제
        </button>
      </div>

      {reportOpen ? (
        <ReportBlockSheet
          targetType="lost-post"
          targetId={item.id}
          onClose={() => setReportOpen(false)}
          onCompleted={(message) =>
            setToast({ message, type: "success" })
          }
        />
      ) : null}

      {showEditModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="edit-title"
        >
          <div className="bg-surface max-h-[90vh] w-full max-w-sm overflow-y-auto rounded-2xl p-6 shadow-xl">
            <Text variant="body" className="font-bold" id="edit-title">
              유실글 수정
            </Text>
            <form onSubmit={handleEditSubmit} className="mt-4 space-y-4">
              <div>
                <label className="mb-1 block text-sm font-medium">상태</label>
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
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                >
                  <option value="searching">찾는 중</option>
                  <option value="found">찾았어요</option>
                  <option value="closed">마감</option>
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  강아지 이름 <span className="text-red-500">*</span>
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
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                  required
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">색상</label>
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
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">크기</label>
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
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                >
                  {SIZE_VALUES.map((v) => (
                    <option key={v} value={v}>
                      {SIZE_LABELS[v as SizeValue]}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">종</label>
                <select
                  value={
                    DOG_BREEDS.includes(editForm.traitSpecies as (typeof DOG_BREEDS)[number])
                      ? editForm.traitSpecies
                      : SPECIES_UNKNOWN
                  }
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      traitSpecies: e.target.value,
                    }))
                  }
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                >
                  {DOG_BREEDS.map((b) => (
                    <option key={b} value={b}>
                      {getBreedLabel(b)}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  특이사항 (최대 {MAX_TAG_EDIT}개)
                </label>
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
                              traitTags: prev.traitTags.filter((id) => id !== tag.id),
                            }));
                          } else if (!disabled) {
                            setEditForm((prev) => ({
                              ...prev,
                              traitTags: [...prev.traitTags, tag.id],
                            }));
                          }
                        }}
                        disabled={disabled}
                        className={cn(
                          "rounded-full px-3 py-1.5 text-sm transition-colors",
                          selected
                            ? "bg-primary text-white"
                            : "bg-muted text-muted-foreground hover:bg-muted/80",
                          disabled && "opacity-50 cursor-not-allowed"
                        )}
                      >
                        {tag.labelKo}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">
                  추가 설명
                </label>
                <textarea
                  value={editForm.note}
                  onChange={(e) =>
                    setEditForm((prev) => ({ ...prev, note: e.target.value }))
                  }
                  placeholder="상세 정보를 입력해주세요"
                  rows={4}
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full resize-none rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                />
              </div>
              <div className="flex gap-3 pt-2">
                <Button
                  type="button"
                  variant="secondary"
                  className="flex-1"
                  onClick={() => setShowEditModal(false)}
                >
                  취소
                </Button>
                <Button type="submit" variant="primary" className="flex-1">
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
          <div className="bg-surface w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <Text variant="body" className="font-bold" id="delete-title">
              이 유실글을 삭제할까요?
            </Text>
            <Text variant="caption" color="caption" className="mt-2 block">
              삭제하면 복구할 수 없습니다.
            </Text>
            <div className="mt-6 flex gap-3">
              <Button
                variant="secondary"
                className="flex-1"
                onClick={() => setShowDeleteConfirm(false)}
              >
                취소
              </Button>
              <Button
                variant="primary"
                className="flex-1 border-red-500 bg-red-500 hover:opacity-90"
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
      <LostPostDetailContent />
    </AuthGuard>
  );
}
