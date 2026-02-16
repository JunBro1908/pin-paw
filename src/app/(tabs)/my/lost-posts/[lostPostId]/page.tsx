"use client";

import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Container } from "@/shared/ui/Container";
import { Text } from "@/shared/ui/Text";
import { Button } from "@/shared/ui/Button";
import { Toast } from "@/shared/ui/Toast";
import { AuthGuard } from "@/features/auth/components/AuthGuard";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { useLostPost } from "@/features/lost-posts/hooks/useLostPost";
import { StatusBadge } from "@/features/lost-posts/components/StatusBadge";
import { createClient } from "@/shared/supabase/client";
import { useState } from "react";

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
  const [editForm, setEditForm] = useState({
    traitColor: "",
    traitSize: "",
    traitState: "",
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
      traitColor: item.trait_color ?? "",
      traitSize: item.trait_size ?? "",
      traitState: item.trait_state ?? "",
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
          traitColor: editForm.traitColor.trim() || undefined,
          traitSize: editForm.traitSize.trim() || undefined,
          traitState: editForm.traitState.trim() || undefined,
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
    ? new Date(item.lost_at).toLocaleString("ko-KR")
    : "";
  const traits = [item.trait_color, item.trait_size, item.trait_state]
    .filter(Boolean)
    .join(" · ");

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

      <div className="mb-6">
        <StatusBadge status={item.status} size="md" />
      </div>

      <Text variant="title" className="mb-2">
        유실 일시
      </Text>
      <Text variant="body" className="mb-6">
        {lostAt}
      </Text>

      {traits ? (
        <>
          <Text variant="body" className="mb-1 font-bold">
            특징
          </Text>
          <Text variant="body" className="mb-6">
            {traits}
          </Text>
        </>
      ) : null}

      <Link href={`/recommend?lostPostId=${item.id}`} className="mb-6 block">
        <Button variant="primary" className="w-full">
          이 유실글의 추천 제보 보기
        </Button>
      </Link>

      {/* 상태 변경 */}
      <section className="mb-6 space-y-2">
        <Text variant="caption" color="caption" className="block">
          상태 변경
        </Text>
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
          <Text variant="caption" color="caption">
            마감된 유실글입니다.
          </Text>
        )}
      </section>

      <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="text-sm font-medium text-red-600 hover:underline dark:text-red-400"
        >
          유실글 삭제
        </button>
      </div>

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
                  placeholder="색상"
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">크기</label>
                <input
                  type="text"
                  value={editForm.traitSize}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      traitSize: e.target.value,
                    }))
                  }
                  placeholder="크기"
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
                />
              </div>
              <div>
                <label className="mb-1 block text-sm font-medium">특징</label>
                <input
                  type="text"
                  value={editForm.traitState}
                  onChange={(e) =>
                    setEditForm((prev) => ({
                      ...prev,
                      traitState: e.target.value,
                    }))
                  }
                  placeholder="예: 목걸이 착용"
                  className="border-border-subtle focus:border-primary focus:ring-primary/20 w-full rounded-xl border bg-white px-4 py-3 outline-none focus:ring-2"
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
