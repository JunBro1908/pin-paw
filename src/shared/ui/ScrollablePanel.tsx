import type { HTMLAttributes } from "react";
import { cn } from "@/shared/lib/cn";

/**
 * Mobile-first max-height + internal scroll for expandable menus,
 * details panels, dropdowns, and bottom sheets.
 */
export const scrollablePanelClass = {
  /** Compact menus / search result lists */
  dropdown:
    "max-h-[min(40vh,16rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
  /** details/summary bodies, nested option grids */
  panel:
    "max-h-[min(60vh,20rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
  /** Inline lists under accordion sections (e.g. /my 내 제보) */
  list:
    "max-h-[min(50vh,18rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch]",
  /** Fixed/modal sheets above bottom nav + home indicator */
  sheet:
    "max-h-[min(calc(85vh-var(--bottom-nav-height)-env(safe-area-inset-bottom,0px)),36rem)] overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] pb-[max(0.75rem,env(safe-area-inset-bottom))]",
} as const;

export type ScrollablePanelVariant = keyof typeof scrollablePanelClass;

interface ScrollablePanelProps extends HTMLAttributes<HTMLDivElement> {
  variant?: ScrollablePanelVariant;
}

export function ScrollablePanel({
  variant = "panel",
  className,
  ...props
}: ScrollablePanelProps) {
  return (
    <div
      className={cn(scrollablePanelClass[variant], className)}
      {...props}
    />
  );
}
