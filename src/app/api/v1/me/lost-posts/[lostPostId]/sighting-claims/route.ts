import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { isValidUuid, parseEntityIdRequest } from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/me/lost-posts/[lostPostId]/sighting-claims
 * 해당 유실글에서 "내 강아지로 인정"한 sighting_id 목록 (소유자만)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/lost-posts/[lostPostId]/sighting-claims"
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

  const { lostPostId } = await params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
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

  const { data: rows, error } = await supabase
    .from("lost_post_sighting_claims")
    .select("sighting_id")
    .eq("lost_post_id", lostPostId);

  if (error) {
    logger.error("lost_post_sighting_claim.list_failed", {
      error,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  const sightingIds = (rows ?? []).map((r) => r.sighting_id as string);
  return ok({ sightingIds });
}

/**
 * POST /api/v1/me/lost-posts/[lostPostId]/sighting-claims
 * body: { sightingId: string } — "내 강아지로 인정" 추가
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/lost-posts/[lostPostId]/sighting-claims"
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

  const { lostPostId } = await params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
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

  const { error } = await supabase.rpc("claim_recommended_sighting", {
    p_lost_post_id: lostPostId,
    p_sighting_id: sightingId,
  });

  if (error) {
    logger.error("lost_post_sighting_claim.create_failed", {
      error,
      status: 409,
    });
    const message =
      error.message?.includes("sighting_is_not_claimable") ||
      error.message?.includes("sighting_is_not_an_authorized_recommendation")
        ? "이 제보를 북마크할 수 없습니다. 유실글 상태나 차단 여부를 확인해 주세요."
        : "북마크 등록에 실패했습니다.";
    return fail(ApiErrorCode.VALIDATION_ERROR, message, 409);
  }

  return ok({ success: true });
}
