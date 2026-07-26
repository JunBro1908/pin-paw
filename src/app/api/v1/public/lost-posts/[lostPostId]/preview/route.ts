import { createServiceRoleSupabase } from "@/shared/supabase/server";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { isValidUuid } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  assertSharePreviewIsSafe,
  buildLostPostSharePreview,
} from "@/shared/lib/share-preview";

type RouteContext = { params: Promise<{ lostPostId: string }> };

/**
 * GET /api/v1/public/lost-posts/[lostPostId]/preview
 * 공개 공유/OG용. 정밀 위치·note·소유자 식별자는 포함하지 않는다.
 */
export async function GET(request: Request, context: RouteContext) {
  const logger = createRequestLogger(
    request,
    "/api/v1/public/lost-posts/[lostPostId]/preview"
  );
  const { lostPostId } = await context.params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
      400
    );
  }

  const supabase = createServiceRoleSupabase();
  const { data, error } = await supabase.rpc(
    "get_public_lost_post_share_preview",
    { p_lost_post_id: lostPostId }
  );

  if (error) {
    logger.error("share_preview.lookup_failed", { error, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "미리보기 조회에 실패했습니다.", 500);
  }

  const row = Array.isArray(data) ? data[0] : data;
  if (!row) {
    return fail(ApiErrorCode.NOT_FOUND, "공유할 수 없는 유실글입니다.", 404);
  }

  const preview = buildLostPostSharePreview({
    id: row.id,
    status: row.status,
    pet_name: row.pet_name,
    lost_at: row.lost_at,
    trait_color: row.trait_color,
    trait_size: row.trait_size,
    trait_species: row.trait_species,
    trait_tags: row.trait_tags,
    cover_photo_key: row.cover_photo_key,
    hidden_at: null,
    archived_at: null,
    lat: row.approx_lat,
    lng: row.approx_lng,
  });

  if (!preview) {
    return fail(ApiErrorCode.NOT_FOUND, "공유할 수 없는 유실글입니다.", 404);
  }

  try {
    assertSharePreviewIsSafe(
      preview as unknown as Record<string, unknown>
    );
  } catch (cause) {
    logger.error("share_preview.safety_failed", {
      error: cause,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "미리보기 검증에 실패했습니다.", 500);
  }

  return ok(preview);
}
