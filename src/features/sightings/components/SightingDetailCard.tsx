"use client";

import Image from "next/image";
import { Text } from "@/shared/ui/Text";

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

export function SightingDetailCard({
  sighting,
  getImageUrl,
  onClose,
  rightSlot,
  footer,
  className = "",
  showCloseButton = true,
}: SightingDetailCardProps) {
  const sourceCopy =
    sighting.source_type === "shelter"
      ? {
          title: "보호소",
          body: "보호소·공공 데이터에서 가져온 보호 동물 위치입니다. 현장 목격 제보와 출처가 달라요.",
        }
      : {
          title: "목격 제보",
          body: "사용자가 현장에서 올린 목격 기록입니다. 유실 사건·보호소 기록과 구분해 확인할 수 있어요.",
        };
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

      <div className="max-h-[min(70vh,640px)] overflow-y-auto">
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
            <div className="border-border-subtle bg-surface-soft rounded-xl border px-3 py-2.5">
              <p className="text-text-main text-sm font-semibold">
                {sourceCopy.title}
              </p>
              <p className="text-text-sub mt-1 text-xs leading-relaxed">
                {sourceCopy.body}
              </p>
            </div>

            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <Text variant="title" className="text-lg font-bold sm:text-xl">
                  {sighting.author_type === "anon" ? "익명 제보" : "회원 제보"}
                </Text>
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

            {(sighting.trait_color ||
              sighting.trait_size ||
              sighting.trait_species) && (
              <div>
                <p className="mb-2 text-sm font-medium text-gray-500 dark:text-gray-400">
                  색상 · 크기 · 종
                </p>
                <div className="flex flex-wrap gap-2">
                  {sighting.trait_color && (
                    <span className="bg-primary/10 text-primary rounded-lg px-2.5 py-1 text-xs font-medium">
                      {sighting.trait_color}
                    </span>
                  )}
                  {sighting.trait_size && (
                    <span className="rounded-lg bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {sighting.trait_size}
                    </span>
                  )}
                  {sighting.trait_species && (
                    <span className="rounded-lg bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">
                      {sighting.trait_species}
                    </span>
                  )}
                </div>
              </div>
            )}

            <div>
              <p className="mb-1.5 text-sm font-medium text-gray-500 dark:text-gray-400">
                추가 설명
              </p>
              <div className="rounded-xl border border-gray-200 bg-gray-50 p-3.5 sm:p-4 dark:border-gray-600 dark:bg-gray-900/50">
                <p className="text-[15px] leading-relaxed break-words text-gray-800 dark:text-gray-200">
                  {sighting.note || "상세 설명이 없습니다."}
                </p>
              </div>
            </div>

            {footer != null && <div className="pt-1">{footer}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
