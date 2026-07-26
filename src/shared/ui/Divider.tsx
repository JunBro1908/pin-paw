import { cn } from "@/shared/lib/cn";

/**
 * 얇고 심플한 구분선입니다.
 */
export function Divider({ className }: { className?: string }) {
  return <hr className={cn("border-border-subtle my-4", className)} />;
}
