"use client";

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type ReactNode,
  type UIEvent,
} from "react";
import { Text } from "@/shared/ui/Text";
import { ActiveLostCaseCard } from "./ActiveLostCaseCard";
import type { LostPostItem } from "../model/types";
import { cn } from "@/shared/lib/cn";

interface LostCaseCarouselProps {
  items: LostPostItem[];
  refreshing?: boolean;
  selectedId?: string | null;
  onSelect?: (item: LostPostItem) => void;
  primaryAction?: "recommend" | "detail";
  onPrimaryAction?: (item: LostPostItem) => void;
  heading?: string;
  headingAction?: ReactNode;
  className?: string;
}

/**
 * Full-width horizontal page-snap carousel (CSS scroll-snap mandatory pager).
 * One case card fills the track; swipe snaps the next page into frame.
 */
export function LostCaseCarousel({
  items,
  refreshing = false,
  selectedId = null,
  onSelect,
  primaryAction = "detail",
  onPrimaryAction,
  heading = "유실글",
  headingAction,
  className,
}: LostCaseCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const headingId = useId();

  const resolveIndex = useCallback(
    (id: string | null | undefined) => {
      if (!id) return 0;
      const index = items.findIndex((item) => item.id === id);
      return index >= 0 ? index : 0;
    },
    [items]
  );

  const propPageIndex = resolveIndex(selectedId ?? items[0]?.id);
  const [pageIndex, setPageIndex] = useState(propPageIndex);
  const [syncedPropPageIndex, setSyncedPropPageIndex] = useState(propPageIndex);

  // Keep pager aligned with selectedId/items without an effect-driven setState.
  if (propPageIndex !== syncedPropPageIndex) {
    setSyncedPropPageIndex(propPageIndex);
    setPageIndex(propPageIndex);
  }

  useEffect(() => {
    const scroller = scrollerRef.current;
    if (!scroller || items.length === 0) return;
    const width = scroller.clientWidth;
    if (width <= 0) return;
    const targetLeft = pageIndex * width;
    if (Math.abs(scroller.scrollLeft - targetLeft) > 2) {
      scroller.scrollTo({ left: targetLeft, behavior: "auto" });
    }
  }, [pageIndex, items.length]);

  const selectIndex = useCallback(
    (index: number) => {
      const bounded = Math.max(0, Math.min(index, items.length - 1));
      setPageIndex(bounded);
      const item = items[bounded];
      if (item) onSelect?.(item);
    },
    [items, onSelect]
  );

  const handleScroll = useCallback(
    (event: UIEvent<HTMLDivElement>) => {
      const scroller = event.currentTarget;
      const width = scroller.clientWidth;
      if (width <= 0) return;
      const next = Math.round(scroller.scrollLeft / width);
      if (next !== pageIndex && next >= 0 && next < items.length) {
        selectIndex(next);
      }
    },
    [items.length, pageIndex, selectIndex]
  );

  if (items.length === 0) return null;

  const activeItem = items[pageIndex] ?? items[0];

  return (
    <section
      aria-labelledby={headingId}
      className={cn("mb-6", className)}
    >
      <div className="mb-3 flex items-center justify-between gap-3">
        <Text
          as="h2"
          id={headingId}
          variant="title"
          color="main"
          className="min-w-0 shrink"
        >
          {heading}
        </Text>
        {headingAction ? (
          <div className="flex shrink-0 items-center">{headingAction}</div>
        ) : null}
      </div>

      <div
        ref={scrollerRef}
        className="page-snap-carousel"
        aria-label={heading}
        aria-roledescription="carousel"
        onScroll={handleScroll}
      >
        {items.map((item, index) => {
          const selected = item.id === activeItem.id;
          return (
            <div
              key={item.id}
              className="page-snap-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${index + 1} / ${items.length}`}
              onFocusCapture={() => selectIndex(index)}
              onClick={() => selectIndex(index)}
            >
              <ActiveLostCaseCard
                item={item}
                refreshing={refreshing && selected}
                compact={false}
                primaryAction={primaryAction}
                onPrimaryAction={onPrimaryAction}
                className={cn(
                  "w-full max-w-none transition-[box-shadow,ring] duration-200",
                  selected
                    ? "ring-action-primary/30 ring-2 ring-offset-2 ring-offset-[var(--background-warm)]"
                    : "opacity-95"
                )}
              />
            </div>
          );
        })}
      </div>

      {items.length > 1 ? (
        <div
          className="mt-3 flex items-center justify-center gap-1.5"
          role="tablist"
          aria-label="유실글 페이지"
        >
          {items.map((item, index) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={index === pageIndex}
              aria-label={`${index + 1}번째 유실글`}
              className={cn(
                "h-2 rounded-full transition-[width,background-color]",
                index === pageIndex
                  ? "bg-action-primary w-5"
                  : "bg-border-subtle w-2"
              )}
              onClick={() => {
                const scroller = scrollerRef.current;
                selectIndex(index);
                if (scroller) {
                  scroller.scrollTo({
                    left: index * scroller.clientWidth,
                    behavior: "smooth",
                  });
                }
              }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
