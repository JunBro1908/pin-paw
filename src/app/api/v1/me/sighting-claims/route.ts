import { createServerSupabaseClient } from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * GET /api/v1/me/sighting-claims
 * 현재 유저가 "내 강아지로 인정"한 모든 제보의 sighting_id 목록 (소유한 모든 유실글 기준).
 * 지도에서 lostPostId 없이 진입해도 인정한 마커를 초록으로 표시할 때 사용.
 */
export async function GET() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { data: myLostPosts, error: lostError } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("owner_id", session.user.id);

  if (lostError || !myLostPosts?.length) {
    return ok({ sightingIds: [] });
  }

  const lostPostIds = myLostPosts.map((p) => p.id);
  const { data: rows, error } = await supabase
    .from("lost_post_sighting_claims")
    .select("sighting_id")
    .in("lost_post_id", lostPostIds);

  if (error) {
    console.error("[sighting-claims] GET all error:", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  const sightingIds = [
    ...new Set((rows ?? []).map((r) => r.sighting_id as string)),
  ];
  return ok({ sightingIds });
}
