"use client";

import {
  createContext,
  useCallback,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { User, Session } from "@supabase/supabase-js";
import { createClient } from "@/shared/supabase/client";

export interface AuthState {
  user: User | null;
  session: Session | null;
  isLoading: boolean;
}

export interface AuthActions {
  signInWithKakao: () => Promise<void>;
  signOut: () => Promise<void>;
}

export type AuthContextValue = AuthState & AuthActions;

const defaultState: AuthState = {
  user: null,
  session: null,
  isLoading: true,
};

const defaultActions: AuthActions = {
  signInWithKakao: async () => {},
  signOut: async () => {},
};

export const AuthContext = createContext<AuthContextValue | null>(null);

interface AuthProviderProps {
  children: React.ReactNode;
}

/**
 * 인증 전역 상태 Provider
 * Supabase 세션을 한 곳에서 구독하고, 하위 트리 전체에 user/session/isLoading과 로그인·로그아웃을 제공합니다.
 */
export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(defaultState.user);
  const [session, setSession] = useState<Session | null>(defaultState.session);
  const [isLoading, setIsLoading] = useState(defaultState.isLoading);

  const supabase = useMemo(() => createClient(), []);

  useEffect(() => {
    if (!supabase) {
      setIsLoading(false);
      return;
    }

    const initAuth = async () => {
      try {
        const {
          data: { session: currentSession },
        } = await supabase.auth.getSession();
        setSession(currentSession);
        setUser(currentSession?.user ?? null);
      } catch (error) {
        console.error("[AuthProvider] Error fetching session:", error);
      } finally {
        setIsLoading(false);
      }
    };

    initAuth();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
      setUser(newSession?.user ?? null);
      setIsLoading(false);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithKakao = useCallback(async () => {
    if (!supabase) return;
    const currentPath = window.location.pathname;
    await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(currentPath)}`,
      },
    });
  }, [supabase]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  }, [supabase]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      session,
      isLoading,
      signInWithKakao,
      signOut,
    }),
    [user, session, isLoading, signInWithKakao, signOut]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
