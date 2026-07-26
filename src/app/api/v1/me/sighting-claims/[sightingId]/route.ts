import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { isValidUuid } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/me/sighting-claims/[sightingId]
 * 이 제보(sighting)를 "내 강아지로 인정"한 내 유실글 목록 (해제 모달에서 선택지용)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sightingId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/sighting-claims/[sightingId]"
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

  const { sightingId } = await params;
  if (!isValidUuid(sightingId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 sightingId가 필요합니다.",
      400
    );
  }

  const { data: claims, error: claimError } = await supabase
    .from("lost_post_sighting_claims")
    .select("lost_post_id")
    .eq("sighting_id", sightingId);

  if (claimError || !claims?.length) {
    return ok({ lostPosts: [] });
  }

  const lostPostIds = [...new Set(claims.map((c) => c.lost_post_id as string))];
  const { data: lostPosts, error: lostError } = await supabase
    .from("lost_posts")
    .select("id, pet_name, lost_at")
    .in("id", lostPostIds)
    .eq("owner_id", user.id);

  if (lostError) {
    logger.error("sighting_claim.lost_posts_lookup_failed", {
      error: lostError,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  const list = (lostPosts ?? []).map((p) => ({
    id: p.id,
    pet_name: p.pet_name ?? "",
    lost_at: p.lost_at ?? null,
  }));

  return ok({ lostPosts: list });
}
