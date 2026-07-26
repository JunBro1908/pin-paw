import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { isValidUuid } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * DELETE /api/v1/me/lost-posts/[lostPostId]/sighting-claims/[sightingId]
 * "내 강아지로 인정" 해제 (소유자만)
 */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string; sightingId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/lost-posts/[lostPostId]/sighting-claims/[sightingId]"
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

  const { lostPostId, sightingId } = await params;
  if (!isValidUuid(lostPostId) || !isValidUuid(sightingId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId와 sightingId가 필요합니다.",
      400
    );
  }

  const { data: lostPost } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!lostPost) {
    return fail(
      ApiErrorCode.NOT_FOUND,
      "유실글을 찾을 수 없거나 권한이 없습니다.",
      404
    );
  }

  const { error } = await supabase.rpc("unclaim_sighting", {
    p_lost_post_id: lostPostId,
    p_sighting_id: sightingId,
  });

  if (error) {
    logger.error("lost_post_sighting_claim.delete_failed", {
      error,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "삭제에 실패했습니다.", 500);
  }

  return ok({ success: true });
}
