import { NextResponse } from "next/server";
import {
  createServerSupabaseClient,
  getVerifiedUser,
} from "@/shared/supabase/server";
import { getSafeOAuthRedirectUrl } from "@/shared/lib/app-origin";
import { resolvePawColorKey } from "@/shared/lib/paw-avatar-color";

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const oauthError = requestUrl.searchParams.get("error");
  const redirect = requestUrl.searchParams.get("redirect");
  const redirectUrl = getSafeOAuthRedirectUrl(
    process.env.APP_ORIGIN,
    redirect,
    requestUrl.origin
  );

  if (!redirectUrl) {
    return NextResponse.json(
      { error: { message: "Service unavailable" } },
      { status: 503 }
    );
  }

  const homeWithAuth = (code: string) => {
    const url = new URL("/", redirectUrl);
    url.searchParams.set("auth", code);
    return NextResponse.redirect(url);
  };

  if (oauthError) {
    return homeWithAuth(
      oauthError === "access_denied" ? "cancelled" : "failed"
    );
  }

  if (!code) {
    return homeWithAuth("failed");
  }

  const supabase = await createServerSupabaseClient();
  const { data, error } = await supabase.auth.exchangeCodeForSession(code);
  const accessToken = data.session?.access_token;
  const verified =
    !error && accessToken
      ? await getVerifiedUser(supabase, accessToken)
      : { user: null };
  if (!verified.user) {
    await supabase.auth.signOut();
    return homeWithAuth("denied");
  }

  // Persist stable paw color on first successful OAuth (idempotent).
  const assignedKey = resolvePawColorKey(
    verified.user.id,
    verified.user.user_metadata?.paw_color_key
  );
  if (verified.user.user_metadata?.paw_color_key !== assignedKey) {
    const { error: metadataError } = await supabase.auth.updateUser({
      data: { paw_color_key: assignedKey },
    });
    if (metadataError) {
      console.warn("[auth/callback] paw_color_key persist failed", {
        message: metadataError.message,
      });
    }
  }

  return NextResponse.redirect(redirectUrl);
}
