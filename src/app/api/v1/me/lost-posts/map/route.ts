import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * GET /api/v1/me/lost-posts/map
 * 지도 "내 유실글 + 북마크" 레이어용 — 본인 유실글 목록 + 위도·경도
 * Query: limit (default 50)
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "50", 10)),
    50
  );

  const { data, error } = await supabase.rpc(
    "get_my_lost_posts_with_location",
    {
      limit_count: limit,
    }
  );

  if (error) {
    console.error("[lost-posts/map GET]", error);
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "유실글 위치를 불러오는 중 오류가 발생했습니다.",
      500
    );
  }

  return ok(data ?? []);
}
