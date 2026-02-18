import { createServerSupabaseClient } from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * DELETE /api/v1/me/lost-posts/[lostPostId]/sighting-claims/[sightingId]
 * "내 강아지로 인정" 해제 (소유자만)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string; sightingId: string }> }
) {
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

  const { lostPostId, sightingId } = await params;
  if (!lostPostId || !sightingId) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "lostPostId와 sightingId가 필요합니다.",
      400
    );
  }

  const { data: lostPost } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .eq("owner_id", session.user.id)
    .maybeSingle();

  if (!lostPost) {
    return fail(
      ApiErrorCode.NOT_FOUND,
      "유실글을 찾을 수 없거나 권한이 없습니다.",
      404
    );
  }

  const { error } = await supabase
    .from("lost_post_sighting_claims")
    .delete()
    .eq("lost_post_id", lostPostId)
    .eq("sighting_id", sightingId);

  if (error) {
    console.error("[sighting-claims] DELETE error:", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "삭제에 실패했습니다.", 500);
  }

  return ok({ success: true });
}
