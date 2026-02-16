"use client";

import { useAuth } from "@/features/auth/hooks/useAuth";
import Image from "next/image";

interface AuthGuardProps {
  children: React.ReactNode;
  /**
   * 로딩 중일 때 표시할 컴포넌트 (선택)
   */
  fallback?: React.ReactNode;
}

/**
 * 인증이 필요한 페이지를 보호하는 래퍼 컴포넌트
 * 미인증 사용자에게는 페이지 내에서 로그인 UI를 표시합니다.
 * 하단 네비게이션은 유지됩니다.
 */
export function AuthGuard({ children, fallback }: AuthGuardProps) {
  const { user, isLoading, signInWithKakao } = useAuth();

  // 로딩 중
  if (isLoading) {
    return (
      <>
        {fallback || (
          <div className="flex min-h-[60vh] items-center justify-center">
            <p className="text-gray-600">로딩 중...</p>
          </div>
        )}
      </>
    );
  }

  // 미인증 사용자 - 인라인 로그인 UI 표시
  if (!user) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center px-4">
        <div className="w-full max-w-sm space-y-6 text-center">
          <div>
            <h2 className="text-2xl font-bold text-gray-900">
              로그인이 필요합니다
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              소중한 제보를 확인하려면 로그인해주세요.
            </p>
          </div>

          <button
            onClick={signInWithKakao}
            className="mx-auto block transition-opacity hover:opacity-90"
          >
            <Image
              src="/images/kakao_login_medium_narrow.png"
              alt="카카오 로그인"
              width={183}
              height={45}
              priority
            />
          </button>

          <p className="text-xs text-gray-500">
            로그인하시면 서비스 이용약관 및 개인정보 처리방침에
            <br />
            동의하는 것으로 간주됩니다.
          </p>
        </div>
      </div>
    );
  }

  // 인증된 사용자에게 자식 컴포넌트 렌더링
  return <>{children}</>;
}
