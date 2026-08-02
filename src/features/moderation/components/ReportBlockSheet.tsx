"use client";

import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { REPORT_CATEGORIES, type ReportCategory } from "@/shared/lib/api-input";
import { Button } from "@/shared/ui/Button";
import { Text } from "@/shared/ui/Text";
import { useDialogFocus } from "@/shared/ui/dialog-focus";
import { scrollablePanelClass } from "@/shared/ui/ScrollablePanel";
import { cn } from "@/shared/lib/cn";

const CATEGORY_LABELS: Record<ReportCategory, string> = {
  immediate_danger: "즉시 위험",
  animal_abuse: "동물 학대",
  personal_information: "개인정보 노출",
  spam: "스팸/광고",
  misleading: "허위/오해 유발",
  other: "기타",
};

interface ReportBlockSheetProps {
  targetType: "sighting" | "lost-post";
  targetId: string;
  authorUserId?: string | null;
  onClose: () => void;
  onCompleted?: (message: string) => void;
}

export function ReportBlockSheet({
  targetType,
  targetId,
  authorUserId,
  onClose,
  onCompleted,
}: ReportBlockSheetProps) {
  const { session } = useAuth();
  const [category, setCategory] = useState<ReportCategory>("spam");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { dialogRef, closeButtonRef } = useDialogFocus({
    active: true,
    onClose,
  });

  const submitReport = async () => {
    if (!session?.access_token) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/v1/reports/${targetType}/${targetId}`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ category, reason }),
        }
      );
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? "신고에 실패했습니다.");
      }
      onCompleted?.("신고가 접수되었습니다.");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "신고 실패");
    } finally {
      setBusy(false);
    }
  };

  const blockAuthor = async () => {
    if (!session?.access_token || !authorUserId) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch(`/api/v1/me/blocks/${authorUserId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ blocked: true }),
      });
      const result = await response.json();
      if (!response.ok || !result.success) {
        throw new Error(result.error?.message ?? "차단에 실패했습니다.");
      }
      onCompleted?.("사용자를 차단했습니다.");
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "차단 실패");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      ref={dialogRef as React.RefObject<HTMLDivElement>}
      className="fixed inset-0 z-[120] flex items-end justify-center bg-black/40 p-4 sm:items-center"
      role="dialog"
      aria-modal="true"
      aria-label="신고 및 차단"
      onClick={onClose}
    >
      <div
        className={cn(
          "bg-surface w-full max-w-md rounded-2xl p-5 shadow-xl",
          scrollablePanelClass.sheet
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <Text variant="title">신고 / 차단</Text>
        <Text variant="caption" color="caption" className="mt-1 block">
          정확한 위치나 개인 메모는 신고 사유에 포함하지 마세요.
        </Text>

        <label className="mt-4 block text-sm font-medium">
          신고 유형
          <select
            className="mt-1 min-h-11 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800"
            value={category}
            onChange={(event) =>
              setCategory(event.target.value as ReportCategory)
            }
          >
            {REPORT_CATEGORIES.map((value) => (
              <option key={value} value={value}>
                {CATEGORY_LABELS[value]}
              </option>
            ))}
          </select>
        </label>

        <label className="mt-3 block text-sm font-medium">
          사유
          <textarea
            className="mt-1 w-full rounded-xl border border-gray-200 bg-white px-3 py-3 dark:border-gray-600 dark:bg-gray-800"
            rows={4}
            maxLength={1000}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="신고 사유를 입력하세요"
            required
          />
        </label>

        {error ? (
          <Text color="error" className="mt-2">
            {error}
          </Text>
        ) : null}

        <div className="mt-4 space-y-2">
          <Button
            type="button"
            className="min-h-11 w-full"
            isLoading={busy}
            disabled={reason.trim().length < 2}
            onClick={() => void submitReport()}
          >
            신고 접수
          </Button>
          {authorUserId ? (
            <Button
              type="button"
              variant="secondary"
              className="min-h-11 w-full"
              isLoading={busy}
              onClick={() => void blockAuthor()}
            >
              작성자 차단
            </Button>
          ) : null}
          <button
            ref={closeButtonRef}
            type="button"
            className="border-action-primary bg-surface text-text-main hover:bg-surface-soft focus-visible:outline-action-primary flex min-h-11 w-full min-w-11 items-center justify-center rounded-xl border px-4 py-2 font-semibold transition-all focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-95"
            onClick={onClose}
          >
            닫기
          </button>
        </div>
      </div>
    </div>
  );
}
