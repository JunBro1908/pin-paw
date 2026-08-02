"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Button } from "@/shared/ui/Button";
import { Text } from "@/shared/ui/Text";
import { Toast } from "@/shared/ui/Toast";

/**
 * Settings surface: account withdrawal only.
 * In-app notifications are always shown; preference toggles are intentionally omitted.
 */
export function NotificationPreferencesForm() {
  const { session, signOut } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState("");
  const [toast, setToast] = useState<{
    message: string;
    type: "success" | "error";
  } | null>(null);

  const deleteAccount = async () => {
    if (!session?.access_token || confirmDelete !== "탈퇴") return;
    setDeleting(true);
    try {
      const response = await fetch("/api/v1/me/account/deletion", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error ?? "계정 탈퇴에 실패했습니다.");
      }
      setToast({
        message: "탈퇴가 접수되었습니다. 곧 로그아웃됩니다.",
        type: "success",
      });
      await signOut();
    } catch (cause) {
      setToast({
        message:
          cause instanceof Error ? cause.message : "계정 탈퇴에 실패했습니다.",
        type: "error",
      });
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="border-border-subtle bg-surface space-y-4 rounded-2xl border p-5 shadow-sm">
        <div>
          <Text variant="title" className="text-lg">
            계정 탈퇴
          </Text>
          <Text variant="body" color="sub" className="mt-2 block text-sm">
            탈퇴하면 유실글·제보·알림 등 계정 데이터가 삭제되며 되돌릴 수
            없습니다. 확인을 위해 아래에 「탈퇴」를 입력해 주세요.
          </Text>
        </div>
        <input
          className="border-border-subtle focus:ring-action-primary w-full rounded-xl border bg-white px-4 py-3 text-sm focus:ring-2 focus:ring-offset-0 focus:outline-none"
          value={confirmDelete}
          onChange={(event) => setConfirmDelete(event.target.value)}
          placeholder="탈퇴"
          aria-label="계정 탈퇴 확인 문구"
        />
        <Button
          type="button"
          variant="secondary"
          className="w-full border-red-200 text-red-700 hover:bg-red-50"
          isLoading={deleting}
          disabled={confirmDelete !== "탈퇴"}
          onClick={() => void deleteAccount()}
        >
          계정 탈퇴
        </Button>
      </section>

      {toast ? (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
