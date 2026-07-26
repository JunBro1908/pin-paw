import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { readJsonBody } from "@/shared/lib/api-request";
import {
  isFunnelOptOutEnabled,
  parseFunnelEvent,
} from "@/shared/lib/funnel-events";
import { createRequestLogger } from "@/shared/lib/structured-log";

/**
 * POST /api/v1/me/funnel-events
 * first-party 퍼널 이벤트. raw 위치·note·token 수집을 거부한다.
 */
export async function POST(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/me/funnel-events");
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(ApiErrorCode.UNAUTHORIZED, "로그인이 필요합니다.", 401);
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

  const parsed = parseFunnelEvent(body.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "퍼널 이벤트 형식이 유효하지 않습니다.",
      400
    );
  }

  const { data: preferences, error: preferenceError } = await supabase.rpc(
    "get_my_notification_preferences"
  );
  if (preferenceError) {
    logger.error("funnel.preferences_failed", {
      error: preferenceError,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "수신 설정 확인에 실패했습니다.",
      500
    );
  }

  const preferenceRow = Array.isArray(preferences)
    ? preferences[0]
    : preferences;
  if (
    isFunnelOptOutEnabled({
      analyticsOptIn: preferenceRow?.analytics_opt_in,
    })
  ) {
    return ok({ recorded: false, reason: "analytics_opt_out" });
  }

  const { data, error } = await supabase.rpc("record_funnel_event", {
    p_actor_id: user.id,
    p_event_name: parsed.value.name,
    p_lost_post_id: parsed.value.lostPostId,
    p_sighting_id: parsed.value.sightingId,
    p_properties: parsed.value.properties,
  });

  if (error) {
    if (error.message?.includes("funnel_sensitive_property_forbidden")) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "민감 속성은 수집할 수 없습니다.",
        400
      );
    }
    logger.error("funnel.record_failed", { error, status: 500 });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "퍼널 이벤트 기록에 실패했습니다.",
      500
    );
  }

  return ok({ recorded: true, id: data });
}
