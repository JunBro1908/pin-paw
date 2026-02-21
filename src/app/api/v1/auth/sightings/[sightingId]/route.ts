import { NextResponse } from "next/server";
import {
  createServerSupabase,
  getAuthenticatedUser,
  createServerSupabaseClient,
} from "@/shared/supabase/server";
import { fail, ok, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * GET /api/v1/auth/sightings/[sightingId]
 * 인증된 사용자를 위한 제보 단건 상세 (지도 상세 카드/추천 모달과 동일한 형식).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ sightingId: string }> }
) {
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
  if (!sightingId) {
    return fail(ApiErrorCode.INVALID_PARAMS, "sightingId가 필요합니다.", 400);
  }

  const supabase = createServerSupabase();
  const { data: row, error } = await supabase
    .from("sightings")
    .select(
      "id, photo_keys, occurred_at, author_type, trait_color, trait_size, trait_species, note"
    )
    .eq("id", sightingId)
    .maybeSingle();

  if (error) {
    console.error("sightings fetch error:", error);
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
