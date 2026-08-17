"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { Text } from "@/shared/ui/Text";
import { createClient } from "@/shared/supabase/client";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { formatSeoulLostDateTime } from "@/shared/lib/date";
import { formatDogSizeLabel } from "@/shared/constants/traitSizes";
import { SPECIES_UNKNOWN } from "../constants/breeds";
import type { MySightingItem } from "../model/types";
import { PhotoCarousel } from "@/shared/ui/PhotoCarousel";

interface MySightingCardProps {
  item: MySightingItem;
  onDeleted?: () => void;
}

const quietIconClass =
  "inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-action-primary disabled:opacity-50";

const traitChipClass =
  "bg-surface-soft text-text-sub rounded-lg px-2.5 py-1 text-xs font-medium";

function buildTraitTags(item: MySightingItem): string[] {
  const tags: string[] = [];

  const species = item.trait_species?.trim();
  if (species && species !== SPECIES_UNKNOWN && species !== "모름") {
    tags.push(species);
  }

  const size = formatDogSizeLabel(item.trait_size);
  if (size) tags.push(size);

  const color = item.trait_color?.trim();
  if (color) {
    tags.push(color);
  }

  return tags;
}

export function MySightingCard({ item, onDeleted }: MySightingCardProps) {
  const { session } = useAuth();
  const [deleting, setDeleting] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const deleteAttemptKey = useRef<string | null>(null);
  const client = createClient();
  const ref = client?.storage?.from("sightings");
  const photoUrls = ref
    ? (item.photo_keys ?? []).map((key) => ref.getPublicUrl(key).data.publicUrl)
    : [];

  const occurredAt = formatSeoulLostDateTime(item.occurred_at);
  const approximateRegion = item.approximate_region?.trim() || null;
  const traitTags = buildTraitTags(item);

  const handleDelete = async () => {
    if (!session?.access_token) return;
    deleteAttemptKey.current ??= crypto.randomUUID();
    setDeleting(true);
    try {
      const res = await fetch(`/api/v1/me/sightings/${item.id}`, {
        method: "DELETE",
        credentials: "include",
        headers: {
          Authorization: `Bearer ${session.access_token}`,
          "Idempotency-Key": deleteAttemptKey.current,
        },
      });
      if (res.ok) {
        onDeleted?.();
        setShowConfirm(false);
        return;
      }
      const result = await res.json().catch(() => null);
      window.alert(
        result?.error?.message ?? "제보 삭제에 실패했습니다. 다시 시도해주세요."
      );
    } catch {
      window.alert("제보 삭제 중 오류가 발생했습니다.");
    } finally {
      setDeleting(false);
    }
  };

  const actionButtons = (
    <div className="flex shrink-0 items-center">
      <Link
        href={`/my/sightings/${item.id}/edit`}
        className={`${quietIconClass} text-text-main hover:bg-surface-soft`}
        aria-label="제보 수정"
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
          aria-hidden
        >
          <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
          <path d="m15 5 4 4" />
        </svg>
      </Link>
      {session ? (
        <>
          <span
            className="bg-border-subtle mx-0.5 h-5 w-px shrink-0"
            aria-hidden
          />
          <button
            type="button"
            onClick={() => setShowConfirm(true)}
            disabled={deleting}
            className={`${quietIconClass} text-text-caption hover:bg-surface-soft hover:text-error`}
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
              aria-hidden
            >
              <path d="M3 6h18" />
              <path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
              <path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              <line x1="10" y1="11" x2="10" y2="17" />
              <line x1="14" y1="11" x2="14" y2="17" />
            </svg>
          </button>
        </>
      ) : null}
    </div>
  );

  const traitTagsMarkup =
    traitTags.length > 0 ? (
      <div className="flex flex-nowrap gap-1 overflow-hidden">
        {traitTags.map((tag) => (
          <span key={tag} className={`${traitChipClass} shrink-0`}>
            {tag}
          </span>
        ))}
      </div>
    ) : null;

  return (
    <div className="border-border-subtle bg-surface rounded-2xl border p-3.5 shadow-sm">
      <div className="grid grid-cols-[6rem_minmax(0,1fr)] gap-3">
        <div className="relative h-24 w-24 overflow-hidden rounded-xl bg-gray-100">
          {photoUrls.length ? (
            <PhotoCarousel
              urls={photoUrls}
              alt="제보 사진"
              className="h-full w-full"
              aspectClassName="aspect-square"
            />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-2xl">
              📷
            </div>
          )}
        </div>

        <div className="min-w-0">
          <div className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-1">
            {approximateRegion ? (
              <Text variant="caption" color="caption" className="mt-1 block">
                {approximateRegion}
              </Text>
            ) : null}
            {actionButtons}
          </div>
          {occurredAt ? (
            <Text variant="caption" color="caption" className="block">
              {occurredAt}
            </Text>
          ) : null}
          {traitTagsMarkup ? <div className="mt-2">{traitTagsMarkup}</div> : null}
        </div>
      </div>
      <Link
        href={
          item.lat != null && item.lng != null
            ? `/map?lat=${item.lat}&lng=${item.lng}&sightingId=${item.id}`
            : `/map?sightingId=${item.id}`
        }
        className="border-[#d7c6b3] text-[#8f7356] hover:bg-[#f6efe7] focus-visible:ring-[#b99a78] mt-3 flex min-h-10 w-full items-center justify-center rounded-xl border bg-transparent text-sm font-medium transition-colors focus-visible:ring-2 focus-visible:ring-offset-2"
      >
        지도에서 보기
      </Link>

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
