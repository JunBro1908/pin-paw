import {
  getAuthenticatedUser,
  createServerSupabaseClient,
} from "@/shared/supabase/server";
import { fail, ok, ApiErrorCode } from "@/shared/lib/api-response";
import { isValidUuid } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/auth/sightings/[sightingId]
 * 인증된 사용자를 위한 제보 단건 상세 (지도 상세 카드/추천 모달과 동일한 형식).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sightingId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/auth/sightings/[sightingId]"
  );
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
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

  const { data: row, error } = await supabaseAuth.rpc(
    "get_block_filtered_sighting_detail",
    { p_sighting_id: sightingId }
  );

  if (error) {
    logger.error("sighting.auth_lookup_failed", { error, status: 502 });
    return fail(
      ApiErrorCode.UPSTREAM_ERROR,
      "제보를 불러오는 중 오류가 발생했습니다.",
      502
    );
  }

  if (row == null) {
    return fail(ApiErrorCode.NOT_FOUND, "제보를 찾을 수 없습니다.", 404);
  }

  return ok(row);
}
