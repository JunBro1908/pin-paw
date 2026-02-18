import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/shared/supabase/server";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const redirect = requestUrl.searchParams.get("redirect") || "/";

  if (code) {
    const supabase = await createServerSupabaseClient();
    await supabase.auth.exchangeCodeForSession(code);
  }

  const host = request.headers.get("Host") ?? "localhost:3000";
  const protocol = request.headers.get("x-forwarded-proto") ?? "http";
  const baseUrl = `${protocol}://${host}`;

  // 원래 페이지 또는 홈으로 리다이렉트
  return NextResponse.redirect(new URL(redirect, baseUrl));
}
