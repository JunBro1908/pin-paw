"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";

interface ToastProps {
  message: string;
  type?: "success" | "error" | "loading";
  duration?: number;
  onClose?: () => void;
}

/**
 * 모바일 사용자에게 부드러운 피드백을 주는 플로팅 메시지입니다.
 */
export function Toast({
  message,
  type = "success",
  duration = 3000,
  onClose,
}: ToastProps) {
  const [isFadingOut, setIsFadingOut] = useState(false);
  const persistent = type === "loading" || duration <= 0;

  useEffect(() => {
    if (persistent || !onClose) return;

    const fadeTimer = setTimeout(() => setIsFadingOut(true), duration - 500);
    const closeTimer = setTimeout(onClose, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [duration, onClose, persistent]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-10 z-[100] flex justify-center px-6">
      <div
        role={type === "error" ? "alert" : "status"}
        aria-live={type === "error" ? "assertive" : "polite"}
        aria-atomic="true"
        className={cn(
          "animate-in fade-in slide-in-from-top-4 flex max-w-[min(100%,22rem)] items-center gap-2.5 rounded-full px-6 py-3.5 shadow-2xl transition-all duration-500",
          isFadingOut && "translate-y-[-20px] opacity-0",
          type === "success" && "bg-action-primary text-action-on-primary",
          type === "error" &&
            "border-danger-text bg-surface text-danger-text border",
          type === "loading" &&
            "bg-gray-900 text-white dark:bg-gray-100 dark:text-gray-900"
        )}
      >
        {type === "loading" ? (
          <span
            aria-hidden="true"
            className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white dark:border-gray-900/25 dark:border-t-gray-900"
          />
        ) : null}
        <span className="text-base font-semibold tracking-tight">
          {message}
        </span>
      </div>
    </div>
  );
}
