import { hasAdminAppMetadata } from "@/shared/lib/admin-authorization";
import {
  isValidUuid,
  parseAdminReportUpdateRequest,
} from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";

type RouteContext = {
  params: Promise<{ reportId: string }>;
};

const ROUTE = "/api/v1/admin/reports/[reportId]";

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
    logger.warn("admin.report_update_access_denied", {
      actorId: user.id,
      status: 404,
    });
    return fail(
      ApiErrorCode.NOT_FOUND,
      "요청한 리소스를 찾을 수 없습니다.",
      404
    );
  }

  const { reportId } = await context.params;
  if (!isValidUuid(reportId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "reportId가 유효하지 않습니다.",
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
  const parsed = parseAdminReportUpdateRequest(bodyResult.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "신고 상태 변경 요청이 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("update_content_report", {
    p_report_id: reportId,
    p_status: parsed.value.status,
    p_reason: parsed.value.reason,
    p_hidden: parsed.value.hidden ?? null,
  });
  if (error) {
    if (error.code === "P0002") {
      return fail(ApiErrorCode.NOT_FOUND, "신고를 찾을 수 없습니다.", 404);
    }
    if (error.code === "22023") {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "신고 상태 변경 요청이 유효하지 않습니다.",
        400
      );
    }
    logger.error("admin.report_update_failed", {
      error,
      actorId: user.id,
      reportId,
      nextStatus: parsed.value.status,
      hidden: parsed.value.hidden ?? null,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "신고 상태 변경에 실패했습니다.",
      500
    );
  }

  logger.info("admin.report_updated", {
    actorId: user.id,
    reportId,
    nextStatus: parsed.value.status,
    hidden: parsed.value.hidden ?? null,
  });
  return ok(data);
}
