"use client";

import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import { Text } from "@/shared/ui/Text";
import { Icon } from "@/shared/ui/Icon";
import { cn } from "@/shared/lib/cn";
import { scrollablePanelClass } from "@/shared/ui/ScrollablePanel";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { getSightingDetailFields } from "../lib/sighting-detail-presentation";

/** 지도 상세 카드/추천 모달과 동일한 형식의 제보 상세 (API get_sighting_detail 응답과 호환) */
export interface SightingDetailData {
  id: string;
  photo_keys?: string[];
  occurred_at?: string;
  author_type?: "anon" | "user";
  author_user_id?: string | null;
  trait_color?: string;
  trait_size?: string;
  trait_species?: string;
  trait_tags?: string[];
  note?: string;
  source_type?: "sighting" | "shelter";
}

interface SightingDetailCardProps {
  sighting: SightingDetailData;
  getImageUrl: (key: string) => string;
  onClose: () => void;
  /** 카드 상단 우측 슬롯 (예: 북마크 버튼) */
  rightSlot?: React.ReactNode;
  /** 카드 하단 슬롯 (예: 지도에서 보기 버튼) */
  footer?: React.ReactNode;
  /** 카드 래퍼 추가 클래스 (모달용 rounded-2xl 등) */
  className?: string;
  /** 닫기 버튼 표시 여부 */
  showCloseButton?: boolean;
}

type SourceKind = {
  label: string;
  tip: string;
};

function resolveSourceKind(
  sighting: SightingDetailData,
  currentUserId: string | undefined
): SourceKind {
  if (sighting.source_type === "shelter") {
    return {
      label: "보호소",
      tip: "보호소·공공 데이터에서 가져온 보호 동물 위치예요.",
    };
  }
  if (sighting.author_type === "anon") {
    return {
      label: "비회원 제보",
      tip: "로그인 없이 올린 현장 목격이에요.",
    };
  }
  if (
    currentUserId &&
    sighting.author_user_id &&
    sighting.author_user_id === currentUserId
  ) {
    return {
      label: "나의 제보",
      tip: "내가 올린 목격 제보예요.",
    };
  }
  return {
    label: "회원 제보",
    tip: "로그인한 사용자가 올린 현장 목격이에요.",
  };
}

function SourceInfoTip({ tip }: { tip: string }) {
  const [open, setOpen] = useState(false);
  const tipId = useId();
  const rootRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  return (
    <span
      ref={rootRef}
      className="relative inline-flex"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        aria-label="제보 종류 설명"
        aria-expanded={open}
        aria-describedby={open ? tipId : undefined}
        onClick={() => setOpen((value) => !value)}
        className="text-text-caption hover:text-text-sub focus-visible:outline-action-primary inline-flex min-h-11 min-w-11 items-center justify-center rounded-full focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2"
      >
        <span className="inline-flex h-5 w-5 items-center justify-center rounded-full border border-current">
          <Icon name="info" size={12} />
        </span>
      </button>
      {open ? (
        <span
          id={tipId}
          role="tooltip"
          className="border-border-subtle bg-surface text-text-sub absolute top-full left-1/2 z-20 mt-1.5 w-max max-w-[14rem] -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-left text-xs leading-relaxed shadow-sm"
        >
          {tip}
        </span>
      ) : null}
    </span>
  );
}

export function SightingDetailCard({
  sighting,
  getImageUrl,
  onClose,
  rightSlot,
  footer,
  className = "",
  showCloseButton = true,
}: SightingDetailCardProps) {
  const { user } = useAuth();
  const sourceKind = resolveSourceKind(sighting, user?.id);
  const detailFields = getSightingDetailFields(sighting);

  return (
    <div
      className={`bg-surface relative mx-auto w-full max-w-md overflow-hidden rounded-[28px] shadow-[0_8px_40px_rgba(0,0,0,0.15)] ring-1 ring-black/5 dark:ring-white/10 ${className}`}
    >
      {showCloseButton && (
        <button
          type="button"
          onClick={onClose}
          className="absolute top-3 right-3 z-30 rounded-full bg-black/25 p-2 text-white backdrop-blur-md transition-colors hover:bg-black/40"
          aria-label="닫기"
        >
          <svg
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <line x1="18" y1="6" x2="6" y2="18" />
            <line x1="6" y1="6" x2="18" y2="18" />
          </svg>
        </button>
      )}

      <div
        className={cn(scrollablePanelClass.sheet, "max-h-[min(70vh,32rem)]")}
      >
        <div className="flex flex-col">
          {sighting.photo_keys?.[0] && (
            <div className="relative aspect-[4/3] max-h-56 w-full overflow-hidden bg-gray-100 sm:max-h-64 dark:bg-gray-800">
              <Image
                src={getImageUrl(sighting.photo_keys[0])}
                alt="목격 사진"
                fill
                sizes="(max-width: 768px) 100vw, 28rem"
                className="object-cover"
                priority
              />
              <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/20 to-transparent" />
            </div>
          )}

          <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-1.5">
                  <Text
                    variant="title"
                    className="text-lg font-bold sm:text-xl"
                  >
                    {sourceKind.label}
                  </Text>
                  <SourceInfoTip tip={sourceKind.tip} />
                </div>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {sighting.occurred_at
                    ? new Date(sighting.occurred_at).toLocaleString("ko-KR", {
                        timeZone: "Asia/Seoul",
                        year: "numeric",
                        month: "long",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })
                    : ""}
                </p>
              </div>
              {rightSlot != null && <div className="shrink-0">{rightSlot}</div>}
            </div>

            <dl className="border-border-subtle divide-border-subtle divide-y rounded-xl border">
              {detailFields.map((field) => (
                <div
                  key={field.label}
                  className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-3 px-4 py-3 text-sm"
                >
                  <dt className="text-text-caption font-medium">
                    {field.label}
                  </dt>
                  <dd className="text-text-main break-words">{field.value}</dd>
                </div>
              ))}
            </dl>

            {footer != null && <div className="pt-1">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
