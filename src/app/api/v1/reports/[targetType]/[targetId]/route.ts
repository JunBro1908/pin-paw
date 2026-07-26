import { isValidUuid, parseReportRequest } from "@/shared/lib/api-input";
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

const ROUTE = "/api/v1/reports/[targetType]/[targetId]";

export async function POST(request: Request, context: RouteContext) {
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
      "신고 대상이 유효하지 않습니다.",
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
  const parsed = parseReportRequest(bodyResult.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "신고 요청 형식이 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("create_content_report", {
    p_target_type: databaseTargetType,
    p_target_id: targetId,
    p_category: parsed.value.category,
    p_reason: parsed.value.reason,
  });
  if (error) {
    if (error.code === "P0002") {
      return fail(ApiErrorCode.NOT_FOUND, "신고 대상을 찾을 수 없습니다.", 404);
    }
    if (
      error.code === "42501" &&
      error.message.includes("cannot_report_own_content")
    ) {
      return fail(
        ApiErrorCode.FORBIDDEN,
        "본인 소유 콘텐츠는 신고할 수 없습니다.",
        403
      );
    }
    if (error.code === "22023") {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "신고 요청 형식이 유효하지 않습니다.",
        400
      );
    }
    logger.error("report.create_failed", {
      error,
      actorId: user.id,
      targetType: databaseTargetType,
      targetId,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "신고 접수에 실패했습니다.", 500);
  }

  logger.info("report.created", {
    actorId: user.id,
    targetType: databaseTargetType,
    targetId,
    category: parsed.value.category,
  });
  return ok(data);
}
