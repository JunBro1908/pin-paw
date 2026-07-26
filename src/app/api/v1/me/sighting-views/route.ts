import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import {
  parseEntityIdList,
  parseEntityIdRequest,
} from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * GET /api/v1/me/sighting-views?sightingIds=id1,id2,...
 * 현재 유저의 제보별 seen 상태. 지도 마커 색상(본=회색) 병합용.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/me/sighting-views");
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
  const parsed = parseEntityIdList(searchParams.get("sightingIds"), 500);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "sightingIds는 최대 500개의 유효한 UUID여야 합니다.",
      400
    );
  }
  const sightingIds = parsed.value;

  const { data: rows, error } = await supabase
    .from("user_sighting_views")
    .select("sighting_id, seen_at")
    .eq("user_id", user.id)
    .in("sighting_id", sightingIds);

  if (error) {
    logger.error("sighting_view.list_failed", { error, status: 500 });
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
  const logger = createRequestLogger(request, "/api/v1/me/sighting-views");
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

  const { data: existing } = await supabase
    .from("user_sighting_views")
    .select("seen_at")
    .eq("user_id", user.id)
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
      .eq("user_id", user.id)
      .eq("sighting_id", sightingId);
    if (error) {
      logger.error("sighting_view.update_failed", { error, status: 500 });
      return fail(ApiErrorCode.INTERNAL_ERROR, "저장에 실패했습니다.", 500);
    }
  } else {
    const { error } = await supabase.from("user_sighting_views").insert({
      user_id: user.id,
      sighting_id: sightingId,
      seen_at: now,
      updated_at: now,
    });
    if (error) {
      logger.error("sighting_view.insert_failed", { error, status: 500 });
      return fail(ApiErrorCode.INTERNAL_ERROR, "저장에 실패했습니다.", 500);
    }
  }

  return ok({ success: true });
}
