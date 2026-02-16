import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL environment variable.");
}

if (!supabaseAnonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_ANON_KEY environment variable."
  );
}

// 기존 singleton 인스턴스 (레거시 코드 호환성)
export const supabase = createSupabaseClient(supabaseUrl, supabaseAnonKey);

// SSR을 위한 클라이언트 생성 함수
export function createClient() {
  return createSupabaseClient(supabaseUrl!, supabaseAnonKey!);
}
