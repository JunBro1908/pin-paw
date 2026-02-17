"use client";

import Link from "next/link";
import { useState } from "react";
import { Text } from "@/shared/ui/Text";
import { createClient } from "@/shared/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import type { MySightingItem } from "../model/types";

interface MySightingCardProps {
  item: MySightingItem;
  onDeleted?: () => void;
}

export function MySightingCard({ item, onDeleted }: MySightingCardProps) {
  const { session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const client = createClient();
  const ref = client?.storage?.from("sightings");
  const firstKey = item.photo_keys?.[0];
  const thumbUrl =
    ref && firstKey ? ref.getPublicUrl(firstKey).data.publicUrl : "";

  const occurredAt = item.occurred_at
    ? new Date(item.occurred_at).toLocaleString("ko-KR", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "";

  const handleDelete = async () => {
    if (!session?.access_token) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/me/sightings/${item.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      if (res.ok) onDeleted?.();
      setShowConfirm(false);
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="border-border-subtle bg-surface relative flex gap-4 rounded-2xl border p-4 shadow-sm">
      {session && (
        <button
          type="button"
          onClick={() => setShowConfirm(true)}
          disabled={deleting}
          className="absolute top-3 right-3 p-1.5 text-gray-400 hover:text-gray-600 disabled:opacity-50 dark:text-gray-500 dark:hover:text-gray-300"
          aria-label="삭제"
        >
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d="M3 6h18" />
            <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
            <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            <line x1="10" y1="11" x2="10" y2="17" />
            <line x1="14" y1="11" x2="14" y2="17" />
          </svg>
        </button>
      )}
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-xl bg-gray-100">
        {thumbUrl ? (
          <img
            src={thumbUrl}
            alt="제보 사진"
            className="h-full w-full object-cover"
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-2xl">
            📷
          </div>
        )}
      </div>
      <div className="min-w-0 flex-1 pr-6">
        <Text variant="body" className="font-medium">
          {occurredAt}
        </Text>
        {item.note ? (
          <Text
            variant="caption"
            color="caption"
            className="mt-0.5 line-clamp-2"
          >
            {item.note}
          </Text>
        ) : null}
        <Link
          href={
            item.lat != null && item.lng != null
              ? `/map?lat=${item.lat}&lng=${item.lng}&sightingId=${item.id}`
              : `/map?sightingId=${item.id}`
          }
          className="text-primary mt-2 inline-block text-sm font-medium hover:underline"
        >
          지도에서 보기
        </Link>
      </div>

      {showConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="sighting-delete-title"
        >
          <div className="bg-surface w-full max-w-sm rounded-2xl p-6 shadow-xl">
            <p id="sighting-delete-title" className="font-semibold">
              이 제보를 삭제할까요?
            </p>
            <p className="mt-1 text-sm text-gray-500">
              삭제하면 복구할 수 없습니다.
            </p>
            <div className="mt-6 flex gap-3">
              <button
                type="button"
                onClick={() => setShowConfirm(false)}
                className="flex-1 rounded-lg border border-gray-300 py-2.5 font-medium hover:bg-gray-50"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleDelete}
                disabled={deleting}
                className="flex-1 rounded-lg bg-red-500 py-2.5 font-medium text-white hover:bg-red-600 disabled:opacity-50"
              >
                삭제
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
