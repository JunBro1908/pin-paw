import "server-only";

import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

function requireServerEnvironment(
  name:
    | "NEXT_PUBLIC_SUPABASE_URL"
    | "NEXT_PUBLIC_SUPABASE_ANON_KEY"
    | "SUPABASE_SERVICE_ROLE_KEY"
): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} must be configured.`);
  }
  return value;
}

/**
 * 서버 전용 Supabase 클라이언트 (Service Role Key 사용)
 */
export const createServiceRoleSupabase = () => {
  return createClient(
    requireServerEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnvironment("SUPABASE_SERVICE_ROLE_KEY"),
    {
      auth: {
        persistSession: false,
      },
    }
  );
};

export async function isAccountAccessAllowed(
  accessToken: string
): Promise<boolean> {
  const userClient = createClient(
    requireServerEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      auth: { persistSession: false },
      global: { headers: { Authorization: `Bearer ${accessToken}` } },
    }
  );
  const { data, error } = await userClient.rpc("is_account_access_allowed");
  return error == null && data === true;
}

export async function getVerifiedUser(
  authClient: Pick<SupabaseClient, "auth">,
  accessToken: string,
  options: { allowDeletionPending?: boolean } = {}
): Promise<{ user: User } | { user: null }> {
  if (!accessToken) return { user: null };
  const {
    data: { user },
    error,
  } = await authClient.auth.getUser(accessToken);
  if (error || !user) return { user: null };
  if (
    !options.allowDeletionPending &&
    !(await isAccountAccessAllowed(accessToken))
  ) {
    return { user: null };
  }
  return { user };
}

/**
 * 세션 기반 Supabase 클라이언트 (쿠키 기반 인증)
 * Next.js App Router의 cookies()를 활용하여 사용자 세션을 확인합니다.
 */
export const createServerSupabaseClient = async () => {
  const cookieStore = await cookies();

  return createServerClient(
    requireServerEnvironment("NEXT_PUBLIC_SUPABASE_URL"),
    requireServerEnvironment("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            );
          } catch {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing
            // user sessions.
          }
        },
      },
    }
  );
};

/**
 * 쿠키 기반 Supabase 클라이언트에서 검증된 사용자 조회.
 * getSession()의 user 대신 getUser(access_token)으로 Auth 서버 검증 후 반환합니다.
 */
export async function getAuthenticatedUser(
  supabase: Awaited<ReturnType<typeof createServerSupabaseClient>>
): Promise<{ user: User } | { user: null }> {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) return { user: null };
  return getVerifiedUser(supabase, session.access_token);
}
