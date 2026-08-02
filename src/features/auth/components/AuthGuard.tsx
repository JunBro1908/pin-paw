"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";
import { LoginPrompt } from "./LoginPrompt";

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * 로딩 중일 때 표시할 컴포넌트 (선택)
   */
  fallback?: React.ReactNode;
}

/**
 * 인증이 필요한 페이지를 보호하는 래퍼 컴포넌트.
 * 미인증 사용자에게는 LoginPrompt(로그인 유도 UI)를 표시합니다.
 * 하단 네비게이션은 유지됩니다.
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    return (
      <div className="flex min-h-[calc(100dvh-var(--bottom-nav-height)-env(safe-area-inset-bottom,0px)-1rem)] w-full flex-1 flex-col">
        {fallback ?? (
          <div className="flex flex-1 flex-col items-center justify-center px-5">
            <p className="text-text-sub text-center text-sm">로딩 중...</p>
          </div>
        )}
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex min-h-0 w-full flex-1 flex-col">
        <LoginPrompt />
      </div>
    );
  }

  return <>{children}</>;
}
