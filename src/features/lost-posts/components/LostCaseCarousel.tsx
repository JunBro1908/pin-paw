"use client";

import { useEffect, useId, useRef, useState } from "react";
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
  heading?: string;
  className?: string;
}

export function LostCaseCarousel({
  items,
  refreshing = false,
  selectedId = null,
  onSelect,
  primaryAction = "recommend",
  heading = "유실 사건",
  className,
}: LostCaseCarouselProps) {
  const scrollerRef = useRef<HTMLUListElement>(null);
  const headingId = useId();
  const [activeId, setActiveId] = useState<string | null>(
    selectedId ?? items[0]?.id ?? null
  );

  useEffect(() => {
    if (selectedId) setActiveId(selectedId);
  }, [selectedId]);

  useEffect(() => {
    if (!items.length) {
      setActiveId(null);
      return;
    }
    if (!activeId || !items.some((item) => item.id === activeId)) {
      setActiveId(items[0].id);
    }
  }, [items, activeId]);

  if (items.length === 0) return null;

  return (
    <section
      aria-labelledby={headingId}
      className={cn("mb-6", className)}
    >
      <div className="mb-3 flex items-end justify-between gap-3">
        <Text as="h2" id={headingId} variant="body" className="font-medium">
          {heading}
        </Text>
        {items.length > 1 ? (
          <Text variant="caption" color="caption">
            좌우로 넘겨 선택
          </Text>
        ) : null}
      </div>
      <ul
        ref={scrollerRef}
        className="flex snap-x snap-mandatory gap-3 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        aria-label={heading}
      >
        {items.map((item) => {
          const selected = item.id === activeId;
          return (
            <li
              key={item.id}
              className="snap-center"
              onFocusCapture={() => {
                setActiveId(item.id);
                onSelect?.(item);
              }}
              onClick={() => {
                setActiveId(item.id);
                onSelect?.(item);
              }}
            >
              <ActiveLostCaseCard
                item={item}
                refreshing={refreshing && selected}
                compact={items.length > 1}
                primaryAction={primaryAction}
                className={cn(
                  "transition-[box-shadow,ring] duration-200",
                  selected
                    ? "ring-action-primary/40 ring-2 ring-offset-2"
                    : "opacity-95"
                )}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}
