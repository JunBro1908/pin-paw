import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { isValidUuid, parsePagination } from "@/shared/lib/api-input";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string }> }
) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/lost-posts/[lostPostId]/status-history"
  );
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(ApiErrorCode.UNAUTHORIZED, "로그인이 필요합니다.", 401);
  }

  const { lostPostId } = await params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
      400
    );
  }

  const url = new URL(request.url);
  const pagination = parsePagination(
    url.searchParams.get("limit"),
    url.searchParams.get("offset"),
    20,
    50
  );
  if (!pagination.ok) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "페이지 범위가 유효하지 않습니다.",
      400
    );
  }

  const { data: lostPost, error: ownerError } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (ownerError) {
    logger.error("lost_post.status_history_owner_failed", {
      error: ownerError,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }
  if (!lostPost) {
    return fail(ApiErrorCode.NOT_FOUND, "유실글을 찾을 수 없습니다.", 404);
  }

  const { data, error } = await supabase
    .from("lost_post_status_history")
    .select("id, from_status, to_status, changed_at")
    .eq("lost_post_id", lostPostId)
    .order("changed_at", { ascending: false })
    .range(
      pagination.value.offset,
      pagination.value.offset + pagination.value.limit - 1
    );
  if (error) {
    logger.error("lost_post.status_history_list_failed", {
      error,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  return ok({ items: data ?? [] });
}
