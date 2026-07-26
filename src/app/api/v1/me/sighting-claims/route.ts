import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { parseEntityIdRequest } from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/me/sighting-claims
 * 현재 유저가 "내 강아지로 인정"한 모든 제보의 sighting_id 목록 (소유한 모든 유실글 기준).
 * 지도에서 lostPostId 없이 진입해도 인정한 마커를 초록으로 표시할 때 사용.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/me/sighting-claims");
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { data: myLostPosts, error: lostError } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("owner_id", user.id);

  if (lostError || !myLostPosts?.length) {
    return ok({ sightingIds: [] });
  }

  const lostPostIds = myLostPosts.map((p) => p.id);
  const { data: rows, error } = await supabase
    .from("lost_post_sighting_claims")
    .select("sighting_id")
    .in("lost_post_id", lostPostIds);

  if (error) {
    logger.error("sighting_claim.list_failed", { error, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  const sightingIds = [
    ...new Set((rows ?? []).map((r) => r.sighting_id as string)),
  ];
  return ok({ sightingIds });
}

/**
 * DELETE /api/v1/me/sighting-claims
 * body: { sightingId: string }
 * 해당 제보를 내 유실글 북마크에서 해제 (어느 유실글이든 1건만 있어도 삭제).
 */
export async function DELETE(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/me/sighting-claims");
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const body = await readJsonBody(request);
  if (!body.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      body.reason === "body_too_large"
        ? "요청 본문이 너무 큽니다."
        : "JSON 요청 본문이 유효하지 않습니다.",
      body.reason === "body_too_large" ? 413 : 400
    );
  }
  const parsed = parseEntityIdRequest(body.value, "sightingId");
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "유효한 sightingId가 필요합니다.",
      400
    );
  }
  const sightingId = parsed.value;

  const { error } = await supabase.rpc(
    "unclaim_sighting_from_all_my_posts",
    { p_sighting_id: sightingId }
  );

  if (error) {
    logger.error("sighting_claim.delete_failed", { error, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "해제에 실패했습니다.", 500);
  }
  return ok({ success: true });
}
