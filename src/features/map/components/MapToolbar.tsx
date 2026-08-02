"use client";

import Image from "next/image";
import { Icon } from "@/shared/ui/Icon";
import { cn } from "@/shared/lib/cn";
import type { MapLayer } from "../lib/map-domain";

interface MapToolbarProps {
  layer: MapLayer;
  authenticated: boolean;
  listOpen: boolean;
  locating?: boolean;
  onLayerChange: (layer: MapLayer) => void;
  onLocate: () => void;
  onToggleList: () => void;
}

const LAYER_FILTERS: ReadonlyArray<{
  layer: MapLayer;
  label: string;
  text?: "All" | "New";
  icon?: "star";
}> = [
  { layer: "default", label: "전체", text: "All" },
  { layer: "unseen", label: "신규 제보", text: "New" },
  { layer: "bookmark", label: "북마크", icon: "star" },
];

export function MapToolbar({
  layer,
  authenticated,
  listOpen,
  locating = false,
  onLayerChange,
  onLocate,
  onToggleList,
}: MapToolbarProps) {
  const showListToggle = authenticated && layer !== "bookmark";

  return (
    <div className="absolute right-4 bottom-24 z-10 flex max-w-[calc(100%-2rem)] flex-col items-end gap-2">
      {authenticated && (
        <div
          className="border-border-subtle bg-surface grid w-14 max-w-full grid-cols-1 gap-1 rounded-2xl border p-1 shadow-sm"
          role="group"
          aria-label="지도 표시 범위"
        >
          {LAYER_FILTERS.map((filter) => {
            const selected = layer === filter.layer;
            return (
              <button
                key={filter.layer}
                type="button"
                aria-label={filter.label}
                aria-pressed={selected}
                data-layer={filter.layer}
                onClick={() => onLayerChange(filter.layer)}
                className={cn(
                  "flex h-11 w-full items-center justify-center rounded-xl transition-colors",
                  selected
                    ? filter.layer === "bookmark"
                      ? "bg-primary-soft text-orange-500"
                      : "bg-primary-soft text-action-primary"
                    : "text-text-sub hover:bg-surface-soft"
                )}
              >
                {filter.text ? (
                  <span className="text-xs font-semibold tracking-tight">
                    {filter.text}
                  </span>
                ) : (
                  <Icon name="star" size={20} className="text-orange-500" />
                )}
              </button>
            );
          })}
        </div>
      )}

      <div className="border-border-subtle bg-surface flex gap-1 rounded-2xl border p-1 shadow-sm">
        {showListToggle ? (
          <button
            type="button"
            aria-label="제보 목록 보기"
            aria-pressed={listOpen}
            onClick={onToggleList}
            className="text-action-primary hover:bg-surface-soft flex h-11 w-11 items-center justify-center rounded-xl transition-colors"
          >
            <svg
              aria-hidden="true"
              width="22"
              height="22"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <line x1="8" y1="6" x2="21" y2="6" />
              <line x1="8" y1="12" x2="21" y2="12" />
              <line x1="8" y1="18" x2="21" y2="18" />
              <line x1="3" y1="6" x2="3.01" y2="6" />
              <line x1="3" y1="12" x2="3.01" y2="12" />
              <line x1="3" y1="18" x2="3.01" y2="18" />
            </svg>
          </button>
        ) : null}
        <button
          type="button"
          aria-label="현재 위치로 이동"
          onClick={onLocate}
          disabled={locating}
          className="hover:bg-surface-soft flex h-11 w-11 items-center justify-center rounded-xl transition-colors disabled:opacity-50"
        >
          {locating ? (
            <span
              aria-hidden="true"
              className="border-action-primary h-5 w-5 animate-spin rounded-full border-2 border-t-transparent"
            />
          ) : (
            <span className="relative h-6 w-6">
              <Image
                src="/icons/my_location.svg"
                alt=""
                fill
                className="object-contain"
              />
            </span>
          )}
        </button>
      </div>
    </div>
  );
}
