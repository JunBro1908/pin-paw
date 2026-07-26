import { hasAdminAppMetadata } from "@/shared/lib/admin-authorization";
import { isValidUuid, parseModerationRequest } from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";

type RouteContext = {
  params: Promise<{ targetType: string; targetId: string }>;
};

const ROUTE = "/api/v1/admin/moderation/[targetType]/[targetId]";

export async function PATCH(request: Request, context: RouteContext) {
  const logger = createRequestLogger(request, ROUTE);
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);

  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }
  if (!hasAdminAppMetadata(user)) {
    logger.warn("admin.moderation_access_denied", {
      actorId: user.id,
      status: 404,
    });
    return fail(
      ApiErrorCode.NOT_FOUND,
      "요청한 리소스를 찾을 수 없습니다.",
      404
    );
  }

  const { targetType, targetId } = await context.params;
  const databaseTargetType =
    targetType === "lost-post"
      ? "lost_post"
      : targetType === "sighting"
        ? "sighting"
        : null;
  if (!databaseTargetType || !isValidUuid(targetId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "moderation 대상이 유효하지 않습니다.",
      400
    );
  }

  const bodyResult = await readJsonBody(request, 4096);
  if (!bodyResult.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      bodyResult.reason === "body_too_large"
        ? "요청 본문이 너무 큽니다."
        : "JSON 요청 본문이 유효하지 않습니다.",
      bodyResult.reason === "body_too_large" ? 413 : 400
    );
  }
  const parsed = parseModerationRequest(bodyResult.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "moderation 요청 형식이 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("moderate_content", {
    p_target_type: databaseTargetType,
    p_target_id: targetId,
    p_hidden: parsed.value.hidden,
    p_reason: parsed.value.reason,
  });

  if (error) {
    if (error.code === "P0002") {
      return fail(
        ApiErrorCode.NOT_FOUND,
        "요청한 리소스를 찾을 수 없습니다.",
        404
      );
    }
    if (error.code === "22023") {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "moderation 요청 형식이 유효하지 않습니다.",
        400
      );
    }
    logger.error("admin.moderation_failed", {
      error,
      actorId: user.id,
      targetType: databaseTargetType,
      targetId,
      hidden: parsed.value.hidden,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "moderation 처리에 실패했습니다.",
      500
    );
  }

  logger.info("admin.moderation_completed", {
    actorId: user.id,
    targetType: databaseTargetType,
    targetId,
    hidden: parsed.value.hidden,
    changed:
      data !== null &&
      typeof data === "object" &&
      !Array.isArray(data) &&
      (data as Record<string, unknown>).changed === true,
  });
  return ok(data);
}
