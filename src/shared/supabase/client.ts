import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
}

if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable."
  );
}

let browserClient: SupabaseClient | null = null;

/**
 * 브라우저 전용 Supabase 클라이언트 (쿠키 기반 세션)
 * API Route에서 cookies()로 세션을 읽을 수 있도록 쿠키에 세션을 저장합니다.
 * 서버(SSR)에서는 null을 반환합니다.
 */
export function createClient(): SupabaseClient | null {
  if (typeof window === "undefined") return null;
  if (!browserClient) {
    browserClient = createBrowserClient(supabaseUrl, supabaseAnonKey);
  }
  return browserClient;
}

/**
 * 클라이언트 컴포넌트에서 사용하는 Supabase 인스턴스.
 * createBrowserClient를 사용해 세션이 쿠키에 저장되므로,
 * fetch('/api/...') 요청 시 쿠키가 함께 전달되어 서버에서 세션 인식이 가능합니다.
 */
export const supabase = new Proxy({} as SupabaseClient, {
  get(_, prop) {
    const client = createClient();
    if (!client) return undefined;
    return (client as unknown as Record<string | symbol, unknown>)[prop];
  },
});
