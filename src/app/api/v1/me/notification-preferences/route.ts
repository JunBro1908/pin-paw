import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { readJsonBody } from "@/shared/lib/api-request";
import { parseNotificationPreferences } from "@/shared/lib/notification-input";
import { createRequestLogger } from "@/shared/lib/structured-log";

export async function GET(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/notification-preferences"
  );
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(ApiErrorCode.UNAUTHORIZED, "로그인이 필요합니다.", 401);
  }

  const { data, error } = await supabase.rpc("get_my_notification_preferences");
  if (error) {
    logger.error("notification_preferences.get_failed", {
      error,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "수신 설정 조회에 실패했습니다.",
      500
    );
  }

  return ok(data?.[0] ?? null);
}

export async function PATCH(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/notification-preferences"
  );
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
  const parsed = parseNotificationPreferences(body.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "수신 설정 형식이 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc(
    "update_my_notification_preferences",
    {
      p_new_recommendation_enabled: parsed.value.newRecommendationEnabled,
      p_claim_updates_enabled: parsed.value.claimUpdatesEnabled,
      p_lost_post_status_enabled: parsed.value.lostPostStatusEnabled,
      p_analytics_opt_in: parsed.value.analyticsOptIn,
    }
  );
  if (error) {
    logger.error("notification_preferences.update_failed", {
      error,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "수신 설정 저장에 실패했습니다.",
      500
    );
  }

  return ok(data?.[0] ?? null);
}
