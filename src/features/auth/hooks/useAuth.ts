"use client";

import { useContext } from "react";
import type { User, Session } from "@supabase/supabase-js";
import { AuthContext } from "@/features/auth/context/AuthContext";

export interface UseAuthReturn {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
}

/**
 * 인증 전역 상태를 구독하는 훅
 * AuthProvider 하위에서만 사용할 수 있습니다.
 */
export function useAuth(): UseAuthReturn {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error(
      "useAuth must be used within an AuthProvider. Wrap your app with <AuthProvider>."
    );
  }

  return context;
}
