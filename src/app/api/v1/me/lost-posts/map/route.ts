import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { parsePagination } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/me/lost-posts/map
 * 지도 "내 유실글 + 북마크" 레이어용 — 본인 유실글 목록 + 위도·경도
 * Query: limit (default 50)
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/me/lost-posts/map");
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
  const pagination = parsePagination(searchParams.get("limit"), null, 50, 50);
  if (!pagination.ok) {
    return fail(ApiErrorCode.INVALID_PARAMS, "limit이 유효하지 않습니다.", 400);
  }
  const { limit } = pagination.value;

  const { data, error } = await supabase.rpc(
    "get_my_lost_posts_with_location",
    {
      limit_count: limit,
    }
  );

  if (error) {
    logger.error("lost_post.map_failed", { error, status: 500 });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "유실글 위치를 불러오는 중 오류가 발생했습니다.",
      500
    );
  }

  return ok(data ?? []);
}
