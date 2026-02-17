import { createServerSupabaseClient } from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * GET /api/v1/me/sightings — 내 제보 목록 (인증 필수, userId 기반)
 * Query: limit (default 20), offset (default 0)
 * created_at DESC 정렬
 */
export async function GET(request: Request) {
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

  const { searchParams } = new URL(request.url);
  const limit = Math.min(
    Math.max(parseInt(searchParams.get("limit") || "20", 10), 1),
    50
  );
  const offset = Math.max(parseInt(searchParams.get("offset") || "0", 10), 0);

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
