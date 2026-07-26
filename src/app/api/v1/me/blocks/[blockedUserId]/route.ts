import { isValidUuid, parseBlockRequest } from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { ApiErrorCode, fail, ok } from "@/shared/lib/api-response";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";

type RouteContext = {
  params: Promise<{ blockedUserId: string }>;
};

const ROUTE = "/api/v1/me/blocks/[blockedUserId]";

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

  const { blockedUserId } = await context.params;
  if (!isValidUuid(blockedUserId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "차단할 사용자 ID가 유효하지 않습니다.",
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
  const parsed = parseBlockRequest(bodyResult.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "차단 요청 형식이 유효하지 않습니다.",
      400
    );
  }

  const { data, error } = await supabase.rpc("set_user_block", {
    p_blocked_id: blockedUserId,
    p_blocked: parsed.value.blocked,
  });
  if (error) {
    if (error.code === "P0002") {
      return fail(ApiErrorCode.NOT_FOUND, "사용자를 찾을 수 없습니다.", 404);
    }
    if (error.code === "42501" && error.message.includes("cannot_block_self")) {
      return fail(ApiErrorCode.FORBIDDEN, "본인은 차단할 수 없습니다.", 403);
    }
    if (error.code === "22023") {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "차단 요청 형식이 유효하지 않습니다.",
        400
      );
    }
    logger.error("user_block.update_failed", {
      error,
      actorId: user.id,
      blockedUserId,
      blocked: parsed.value.blocked,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "사용자 차단 처리에 실패했습니다.",
      500
    );
  }

  logger.info("user_block.updated", {
    actorId: user.id,
    blockedUserId,
    blocked: parsed.value.blocked,
  });
  return ok(data);
}
