import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { parsePagination } from "@/shared/lib/api-input";

/**
 * GET /api/v1/me/sightings — 내 제보 목록 (인증 필수, userId 기반)
 * Query: limit (default 20), offset (default 0)
 * created_at DESC 정렬
 */
export async function GET(request: Request) {
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const pagination = parsePagination(
    searchParams.get("limit"),
    searchParams.get("offset"),
    20,
    50
  );
  if (!pagination.ok) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "limit과 offset이 유효하지 않습니다.",
      400
    );
  }
  const { limit, offset } = pagination.value;

  const { data: rows, error } = await supabase.rpc("get_my_sightings_list", {
    limit_count: limit,
    offset_count: offset,
  });

  if (error) {
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "목록을 불러오는데 실패했습니다.",
      500
    );
  }

  const items = (rows ?? []).map((r: Record<string, unknown>) => ({
    ...r,
    lat: r.lat != null ? Number(r.lat) : undefined,
    lng: r.lng != null ? Number(r.lng) : undefined,
  }));
  return ok(items);
}
