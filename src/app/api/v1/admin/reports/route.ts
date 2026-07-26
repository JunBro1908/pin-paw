import { hasAdminAppMetadata } from "@/shared/lib/admin-authorization";
import { parsePagination, parseReportStatus } from "@/shared/lib/api-input";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";

const ROUTE = "/api/v1/admin/reports";

export async function GET(request: Request) {
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
    logger.warn("admin.reports_access_denied", {
      actorId: user.id,
      status: 404,
    });
    return fail(
      ApiErrorCode.NOT_FOUND,
      "요청한 리소스를 찾을 수 없습니다.",
      404
    );
  }

  const { searchParams } = new URL(request.url);
  const pagination = parsePagination(
    searchParams.get("limit"),
    searchParams.get("offset"),
    20,
    100
  );
  const status = parseReportStatus(searchParams.get("status"));
  if (!pagination.ok || !status.ok) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "신고 목록 조회 파라미터가 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("list_content_reports", {
    p_status: status.value,
    p_limit: pagination.value.limit,
    p_offset: pagination.value.offset,
  });
  if (error) {
    logger.error("admin.reports_lookup_failed", {
      error,
      actorId: user.id,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "신고 목록을 불러오지 못했습니다.",
      500
    );
  }
  return ok(data);
}
