import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

type RouteContext = { params: Promise<{ sightingId: string }> };

/**
 * GET /api/v1/me/sightings/[sightingId] — 본인 제보 단건 (위치 포함, 지도 포커스용)
 */
export async function GET(request: Request, context: RouteContext) {
  const { sightingId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { data: rows, error } = await supabase.rpc("get_my_sighting_center", {
    sighting_id: sightingId,
  });

  if (error) {
    console.error("[me/sightings GET single]", error);
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "제보 정보를 불러오는데 실패했습니다.",
      500
    );
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || row.lat == null || row.lng == null) {
    return fail(ApiErrorCode.NOT_FOUND, "제보를 찾을 수 없습니다.", 404);
  }

  return ok({ lat: Number(row.lat), lng: Number(row.lng) });
}

/**
 * DELETE /api/v1/me/sightings/[sightingId] — 본인 제보만 삭제 (user_id 일치 시)
 * 비인증(anon) 제보는 user_id가 null이므로 삭제 불가 (관리자 전용 예정)
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { sightingId } = await context.params;
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { data: existing, error: fetchError } = await supabase
    .from("sightings")
    .select("id, user_id")
    .eq("id", sightingId)
    .maybeSingle();

  if (fetchError) {
    console.error("[me/sightings DELETE]", fetchError);
    return fail(ApiErrorCode.INTERNAL_ERROR, "삭제 처리에 실패했습니다.", 500);
  }

  if (!existing) {
    return fail(ApiErrorCode.NOT_FOUND, "제보를 찾을 수 없습니다.", 404);
  }

  if (existing.user_id !== user.id) {
    return fail(
      ApiErrorCode.FORBIDDEN,
      "본인이 등록한 제보만 삭제할 수 있습니다.",
      403
    );
  }

  const { error: deleteError } = await supabase
    .from("sightings")
    .delete()
    .eq("id", sightingId);

  if (deleteError) {
    console.error("[me/sightings DELETE]", deleteError);
    return fail(ApiErrorCode.INTERNAL_ERROR, "삭제 처리에 실패했습니다.", 500);
  }

  return ok({ deleted: true });
}
