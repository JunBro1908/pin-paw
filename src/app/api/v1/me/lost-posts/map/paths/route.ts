import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/me/lost-posts/map/paths
 * 지도 "내 유실글+북마크" 레이어용 — 유실 시각 기준 이동 경로 (유실 위치 → occurred_at 순 제보).
 * 유실 시점 이전(occurred_at < lost_at) 제보는 제외.
 * 반환: [{ lost_post_id, lost_lat, lost_lng, lost_at, points: [{ sighting_id, lat, lng, occurred_at }, ...] }, ...]
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/lost-posts/map/paths"
  );
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { data, error } = await supabase.rpc("get_my_lost_post_paths");

  if (error) {
    logger.error("lost_post.map_paths_failed", { error, status: 500 });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "경로를 불러오는 중 오류가 발생했습니다.",
      500
    );
  }

  return ok(data ?? []);
}
