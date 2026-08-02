"use client";

import Image from "next/image";
import Link from "next/link";
import { useState } from "react";
import { useAuth } from "@/features/auth/hooks/useAuth";
import { Text } from "@/shared/ui/Text";

/**
 * 비로그인 사용자에게 표시하는 로그인 유도 컴포넌트.
 * AuthGuard 또는 마이페이지 등에서 재사용합니다.
 */
export function LoginPrompt() {
  const { signInWithKakao } = useAuth();
  const [pending, setPending] = useState(false);

  const handleLogin = async () => {
    if (pending) return;
    setPending(true);
    try {
      await signInWithKakao();
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center px-5 py-10">
      <div className="flex w-full max-w-sm flex-col items-center gap-6 text-center">
        <div className="flex flex-col items-center gap-2">
          <Text as="h1" variant="title" className="block">
            로그인이 필요합니다
          </Text>
          <Text variant="caption" color="caption" className="block">
            유실글 등록, 내 제보 확인 등 서비스를 이용하려면 로그인해 주세요.
          </Text>
        </div>

        <button
          type="button"
          onClick={() => void handleLogin()}
          disabled={pending}
          className="flex w-full justify-center transition-opacity hover:opacity-90 disabled:opacity-60"
          aria-label="카카오 로그인"
          aria-busy={pending}
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
          로그인 전에{" "}
          <Link href="/terms" className="underline underline-offset-2">
            이용약관
          </Link>
          과{" "}
          <Link href="/privacy" className="underline underline-offset-2">
            개인정보 처리방침
          </Link>
          을 확인해 주세요.
        </Text>
      </div>
    </div>
  );
}
