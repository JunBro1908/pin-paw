"use client";

import { useEffect, useState } from "react";
import { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/shared/supabase/client";

interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * 인증 상태 관리 훅
 * Supabase Auth의 세션 및 사용자 상태를 관리합니다.
 */
export function useAuth(): UseAuthReturn {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const supabase = createClient();

  useEffect(() => {
    // 초기 세션 가져오기
    const initAuth = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } catch (error) {
        console.error("Error fetching session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    // 인증 상태 변경 구독
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  /**
   * 카카오로 로그인
   */
  const signInWithKakao = async () => {
    // 현재 경로를 저장하여 로그인 후 돌아올 수 있도록 함
    const currentPath = window.location.pathname;

    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(currentPath)}`,
      },
    });
  };

  /**
   * 로그아웃
   */
  const signOut = async () => {
    await supabase.auth.signOut();
  };

  return {
    user,
    session,
    isLoading,
    signInWithKakao,
    signOut,
  };
}
