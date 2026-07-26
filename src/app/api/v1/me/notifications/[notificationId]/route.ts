import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { isValidUuid } from "@/shared/lib/api-input";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ notificationId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/notifications/[notificationId]"
  );
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(ApiErrorCode.UNAUTHORIZED, "로그인이 필요합니다.", 401);
  }

  const { notificationId } = await params;
  if (!isValidUuid(notificationId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 notificationId가 필요합니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("mark_my_notification_read", {
    p_notification_id: notificationId,
  });
  if (error) {
    logger.error("notification.mark_read_failed", { error, status: 500 });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "알림 읽음 처리에 실패했습니다.",
      500
    );
  }
  if (data !== true) {
    return fail(ApiErrorCode.NOT_FOUND, "알림을 찾을 수 없습니다.", 404);
  }

  return ok({ success: true });
}
