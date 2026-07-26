import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { parsePagination } from "@/shared/lib/api-input";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";

export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/me/notifications");
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(ApiErrorCode.UNAUTHORIZED, "로그인이 필요합니다.", 401);
  }

  const url = new URL(request.url);
  const pagination = parsePagination(
    url.searchParams.get("limit"),
    url.searchParams.get("offset"),
    20,
    100
  );
  if (!pagination.ok) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "페이지 범위가 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("get_my_notifications", {
    p_limit: pagination.value.limit,
    p_offset: pagination.value.offset,
  });
  if (error) {
    logger.error("notification.list_failed", { error, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "알림 조회에 실패했습니다.", 500);
  }

  return ok({ items: data ?? [] });
}
