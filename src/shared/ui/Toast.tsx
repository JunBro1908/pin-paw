"use client";

import { useEffect, useState } from "react";
import { cn } from "@/shared/lib/cn";

interface ToastProps {
  message: string;
  type?: "success" | "error";
  duration?: number;
  onClose: () => void;
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

  useEffect(() => {
    // 사라지기 0.5초 전부터 애니메이션 시작
    const fadeTimer = setTimeout(() => setIsFadingOut(true), duration - 500);
    const closeTimer = setTimeout(onClose, duration);

    return () => {
      clearTimeout(fadeTimer);
      clearTimeout(closeTimer);
    };
  }, [duration, onClose]);

  return (
    <div className="pointer-events-none fixed inset-x-0 top-10 z-[100] flex justify-center px-6">
      <div
        className={cn(
          "animate-in fade-in slide-in-from-top-4 flex items-center gap-2 rounded-full px-6 py-3 shadow-2xl transition-all duration-500",
          isFadingOut && "translate-y-[-20px] opacity-0",
          type === "success" ? "bg-primary text-white" : "bg-red-500 text-white"
        )}
      >
        <span className="text-sm font-bold">
          {type === "success" ? "✅" : "⚠️"}
        </span>
        <span className="text-sm font-medium">{message}</span>
      </div>
    </div>
  );
}
