"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef } from "react";
import type { ReactNode, Ref, SyntheticEvent } from "react";
import type { LostPostMapItem } from "../lib/map-data-state";
import type { MapItem } from "../types/naver";

export type MapDetailSelection =
  | { kind: "sighting"; item: MapItem }
  | { kind: "lost"; item: LostPostMapItem };

interface MapDetailSheetProps {
  selection: MapDetailSelection;
  onClose: () => void;
  getLostPostImageUrl: (key: string) => string;
  children?: ReactNode;
}

interface MapDetailSheetSurfaceProps extends MapDetailSheetProps {
  closeButtonRef?: Ref<HTMLButtonElement>;
  dialogRef?: Ref<HTMLElement>;
}

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function stopPropagation(event: SyntheticEvent) {
  event.stopPropagation();
}

export function MapDetailSheet({
  selection,
  onClose,
  getLostPostImageUrl,
  children,
}: MapDetailSheetProps) {
  const dialogRef = useRef<HTMLElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const closeDialog = useCallback(() => {
    onCloseRef.current();
  }, []);

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeButtonRef.current?.focus();

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const dialog = dialogRef.current;
      if (!dialog) return;
      const focusable = Array.from(
        dialog.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)
      ).filter((element) => element.getAttribute("aria-hidden") !== "true");
      if (focusable.length === 0) {
        event.preventDefault();
        closeButtonRef.current?.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !dialog.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey &&
        (active === last || !dialog.contains(active))
      ) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus();
    };
  }, []);

  return (
    <MapDetailSheetSurface
      selection={selection}
      onClose={closeDialog}
      getLostPostImageUrl={getLostPostImageUrl}
      closeButtonRef={closeButtonRef}
      dialogRef={dialogRef}
    >
      {children}
    </MapDetailSheetSurface>
  );
}

export function MapDetailSheetSurface({
  selection,
  onClose,
  getLostPostImageUrl,
  closeButtonRef,
  dialogRef,
  children,
}: MapDetailSheetSurfaceProps) {
  return (
    <aside
      ref={dialogRef}
      role="dialog"
      aria-modal="true"
      aria-label="선택한 지도 정보"
      className="absolute inset-x-0 bottom-[104px] z-50 flex justify-center px-4 sm:px-6"
      onMouseDown={stopPropagation}
      onMouseUp={stopPropagation}
      onMouseMove={stopPropagation}
      onTouchStart={stopPropagation}
      onTouchMove={stopPropagation}
      onTouchEnd={stopPropagation}
      onWheel={stopPropagation}
      onClick={stopPropagation}
    >
      <div className="border-border-subtle bg-surface relative w-full max-w-md overflow-hidden rounded-2xl border shadow-sm">
        <button
          ref={closeButtonRef}
          type="button"
          onClick={onClose}
          className="border-border-subtle bg-surface text-text-main hover:bg-surface-soft absolute top-2 right-2 z-30 flex h-11 w-11 items-center justify-center rounded-xl border shadow-sm transition-colors"
          aria-label="선택한 지도 정보 닫기"
        >
          <svg
            aria-hidden="true"
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

        {selection.kind === "sighting" ? (
          children
        ) : (
          <LostPostDetail
            item={selection.item}
            getImageUrl={getLostPostImageUrl}
          />
        )}
      </div>
    </aside>
  );
}

function LostPostDetail({
  item,
  getImageUrl,
}: {
  item: LostPostMapItem;
  getImageUrl: (key: string) => string;
}) {
  const traits = [item.trait_color, item.trait_size, item.trait_species].filter(
    Boolean
  );

  return (
    <div className="max-h-[min(70vh,640px)] overflow-y-auto">
      <div className="bg-surface-soft relative aspect-[4/3] max-h-56 w-full overflow-hidden sm:max-h-64">
        {item.cover_photo_key ? (
          <Image
            src={getImageUrl(item.cover_photo_key)}
            alt="유실 동물 대표 사진"
            fill
            sizes="(max-width: 768px) 100vw, 28rem"
            className="object-cover"
            priority
          />
        ) : (
          <div className="text-text-sub flex h-full items-center justify-center text-sm">
            대표 사진 없음
          </div>
        )}
      </div>

      <div className="space-y-4 px-5 py-5 sm:px-6 sm:py-6">
        <div>
          <p className="text-sm font-bold text-[#B85C1B]">유실</p>
          <h2 className="text-text-main mt-1 pr-12 text-lg font-semibold">
            {item.pet_name?.trim() || "이름 없음"}
          </h2>
          {item.lost_at && (
            <p className="text-text-sub mt-1 text-sm">
              유실일:{" "}
              {new Date(item.lost_at).toLocaleString("ko-KR", {
                timeZone: "Asia/Seoul",
                year: "numeric",
                month: "long",
                day: "numeric",
                hour: "2-digit",
                minute: "2-digit",
              })}
            </p>
          )}
        </div>

        {traits.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {traits.map((trait) => (
              <span
                key={trait}
                className="bg-surface-soft text-text-sub rounded-lg px-2.5 py-1 text-xs font-medium"
              >
                {trait}
              </span>
            ))}
          </div>
        )}

        {item.note?.trim() && (
          <p className="text-text-sub text-sm leading-relaxed break-words">
            {item.note}
          </p>
        )}
      </div>
    </div>
  );
}
