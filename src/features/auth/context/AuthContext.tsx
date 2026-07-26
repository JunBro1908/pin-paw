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
import { getOAuthReturnPath } from "@/shared/lib/oauth-return-path";
import {
  invalidateMyLostPostsCache,
  prefetchMyLostPosts,
} from "@/features/lost-posts/hooks/useMyLostPosts";
import {
  invalidateMySightingsCache,
  prefetchMySightings,
} from "@/features/sightings/hooks/useMySightings";

function warmAuthenticatedCaches(accessToken: string | undefined) {
  if (!accessToken) {
    invalidateMyLostPostsCache();
    invalidateMySightingsCache();
    return;
  }
  void prefetchMyLostPosts(accessToken);
  void prefetchMySightings(accessToken);
}

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
        warmAuthenticatedCaches(currentSession?.access_token);
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
      warmAuthenticatedCaches(newSession?.access_token);
    });

    return () => {
      subscription.unsubscribe();
    };
  }, [supabase]);

  const signInWithKakao = useCallback(async () => {
    if (!supabase) {
      console.error("[AuthProvider] Supabase client is unavailable");
      return;
    }

    const currentPath = getOAuthReturnPath(
      window.location.pathname,
      window.location.search
    );

    const { error } = await supabase.auth.signInWithOAuth({
      provider: "kakao",
      options: {
        redirectTo: `${window.location.origin}/auth/callback?redirect=${encodeURIComponent(currentPath)}`,
      },
    });
    if (error) {
      console.error("[AuthProvider] Kakao OAuth failed:", error.message);
      const providerDisabled = /provider is not enabled/i.test(error.message);
      window.alert(
        providerDisabled
          ? "카카오 로그인이 아직 켜져 있지 않습니다.\n\nSupabase Dashboard → Authentication → Providers → Kakao를 활성화하고,\nRedirect URL에 현재 앱의 /auth/callback 을 추가한 뒤 다시 시도해주세요."
          : `카카오 로그인을 시작할 수 없습니다.\n${error.message}`
      );
    }
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
