"use client";

import Image from "next/image";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Text } from "@/shared/ui/Text";

/**
 * 비로그인 사용자에게 표시하는 로그인 유도 컴포넌트.
 * AuthGuard 또는 마이페이지 등에서 재사용합니다.
 */
export function LoginPrompt() {
  const { signInWithKakao } = useAuth();

  return (
    <div className="flex min-h-[60vh] items-center justify-center px-4">
      <div className="w-full max-w-sm space-y-6 text-center">
        <div>
          <Text variant="title" className="block">
            로그인이 필요합니다
          </Text>
          <Text variant="caption" color="caption" className="mt-2 block">
            유실글 등록, 내 제보 확인 등 서비스를 이용하려면 로그인해 주세요.
          </Text>
        </div>

        <button
          type="button"
          onClick={signInWithKakao}
          className="mx-auto block transition-opacity hover:opacity-90"
          aria-label="카카오 로그인"
        >
          <Image
            src="/images/kakao_login_medium_narrow.png"
            alt="카카오 로그인"
            width={183}
            height={45}
            priority
          />
        </button>

        <Text variant="caption" color="caption" className="block text-xs">
          로그인하시면 서비스 이용약관 및 개인정보 처리방침에 동의하는 것으로
          간주됩니다.
        </Text>
      </div>
    </div>
  );
}
