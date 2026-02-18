import { createServerSupabaseClient } from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * GET /api/v1/me/sighting-views?sightingIds=id1,id2,...
 * 현재 유저의 제보별 seen 상태. 지도 마커 색상(본=회색) 병합용.
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
  const sightingIdsParam = searchParams.get("sightingIds");
  if (!sightingIdsParam) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "sightingIds 쿼리 파라미터가 필요합니다.",
      400
    );
  }

  const sightingIds = sightingIdsParam
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (sightingIds.length === 0) {
    return ok({ views: {} });
  }
  if (sightingIds.length > 500) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "sightingIds는 최대 500개까지 요청할 수 있습니다.",
      400
    );
  }

  const { data: rows, error } = await supabase
    .from("user_sighting_views")
    .select("sighting_id, seen_at")
    .eq("user_id", session.user.id)
    .in("sighting_id", sightingIds);

  if (error) {
    console.error("[sighting-views] GET error:", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  const views: Record<string, { seen: boolean }> = {};
  for (const r of rows ?? []) {
    const id = r.sighting_id as string;
    views[id] = { seen: r.seen_at != null };
  }
  return ok({ views });
}

/**
 * POST /api/v1/me/sighting-views — "본 적 있음" 기록
 * body: { sightingId: string }
 */
export async function POST(request: Request) {
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

  let body: { sightingId?: string };
  try {
    body = await request.json();
  } catch {
    return fail(ApiErrorCode.VALIDATION_ERROR, "JSON 본문이 필요합니다.", 400);
  }

  const sightingId = body.sightingId;
  if (!sightingId || typeof sightingId !== "string") {
    return fail(ApiErrorCode.VALIDATION_ERROR, "sightingId가 필요합니다.", 400);
  }

  const { data: existing } = await supabase
    .from("user_sighting_views")
    .select("seen_at")
    .eq("user_id", session.user.id)
    .eq("sighting_id", sightingId)
    .maybeSingle();

  const now = new Date().toISOString();
  if (existing) {
    const { error } = await supabase
      .from("user_sighting_views")
      .update({
        seen_at: existing.seen_at ?? now,
        updated_at: now,
      })
      .eq("user_id", session.user.id)
      .eq("sighting_id", sightingId);
    if (error) {
      console.error("[sighting-views] POST update error:", error);
      return fail(ApiErrorCode.INTERNAL_ERROR, "저장에 실패했습니다.", 500);
    }
  } else {
    const { error } = await supabase.from("user_sighting_views").insert({
      user_id: session.user.id,
      sighting_id: sightingId,
      seen_at: now,
      updated_at: now,
    });
    if (error) {
      console.error("[sighting-views] POST insert error:", error);
      return fail(ApiErrorCode.INTERNAL_ERROR, "저장에 실패했습니다.", 500);
    }
  }

  return ok({ success: true });
}
