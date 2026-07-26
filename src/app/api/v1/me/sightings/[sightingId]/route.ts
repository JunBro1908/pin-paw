import {
  createServiceRoleSupabase,
  getVerifiedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import {
  isValidUuid,
  parseSightingUpdateRequest,
} from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { readJsonBody } from "@/shared/lib/api-request";
import { verifyUploadIntents } from "@/shared/lib/upload-intents";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import { extractColorTokens } from "@/shared/constants/traitColors";
import { normalizeSize } from "@/shared/constants/traitSizes";
import { TRAIT_TAG_IDS } from "@/shared/constants/traitTags";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";

type RouteContext = { params: Promise<{ sightingId: string }> };

async function authenticate(request: Request) {
  const supabase = createServiceRoleSupabase();
  const authorization = request.headers.get("Authorization");
  const token = authorization?.startsWith("Bearer ")
    ? authorization.slice(7)
    : "";
  const { user } = await getVerifiedUser(supabase, token);
  return { supabase, user };
}

function mutationError(
  error: { message?: string } | null,
  fallback: string
) {
  if (error?.message?.includes("resource_not_found")) {
    return fail(ApiErrorCode.NOT_FOUND, "제보를 찾을 수 없습니다.", 404);
  }
  if (error?.message?.includes("idempotency_conflict")) {
    return fail(
      "IDEMPOTENCY_CONFLICT",
      "동일한 Idempotency-Key로 다른 요청을 보낼 수 없습니다.",
      409
    );
  }
  if (error?.message?.includes("invalid_upload_intent")) {
    return fail(
      "UPLOAD_INTENT_CONFLICT",
      "이미 사용되었거나 유효하지 않은 업로드입니다.",
      409
    );
  }
  return fail(ApiErrorCode.INTERNAL_ERROR, fallback, 500);
}

export async function GET(request: Request, context: RouteContext) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/sightings/[sightingId]"
  );
  const { sightingId } = await context.params;
  const { supabase, user } = await authenticate(request);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }
  if (!isValidUuid(sightingId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 sightingId가 필요합니다.",
      400
    );
  }

  const { data: rows, error } = await supabase.rpc(
    "get_owned_sighting_for_mutation",
    { p_actor_id: user.id, p_sighting_id: sightingId }
  );

  if (error) {
    logger.error("sighting.owner_lookup_failed", { error, status: 500 });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "제보 정보를 불러오는데 실패했습니다.",
      500
    );
  }

  const row = Array.isArray(rows) ? rows[0] : rows;
  if (!row || row.lat == null || row.lng == null) {
    return fail(ApiErrorCode.NOT_FOUND, "제보를 찾을 수 없습니다.", 404);
  }

  return ok({
    ...row,
    lat: Number(row.lat),
    lng: Number(row.lng),
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/sightings/[sightingId]"
  );
  const { sightingId } = await context.params;
  const { supabase, user } = await authenticate(request);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }
  if (!isValidUuid(sightingId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 sightingId가 필요합니다.",
      400
    );
  }

  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || !isValidUuid(idempotencyKey)) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "유효한 Idempotency-Key가 필요합니다.",
      400
    );
  }
  const body = await readJsonBody(request);
  const parsed = body.ok ? parseSightingUpdateRequest(body.value) : body;
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "제보 수정 요청 형식이 유효하지 않습니다.",
      body.ok ? 400 : body.reason === "body_too_large" ? 413 : 400
    );
  }

  const { data: rows, error: lookupError } = await supabase.rpc(
    "get_owned_sighting_for_mutation",
    { p_actor_id: user.id, p_sighting_id: sightingId }
  );
  const existing = Array.isArray(rows) ? rows[0] : rows;
  if (lookupError) {
    logger.error("sighting.update_lookup_failed", {
      error: lookupError,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "수정 처리에 실패했습니다.", 500);
  }
  if (!existing) {
    return fail(ApiErrorCode.NOT_FOUND, "제보를 찾을 수 없습니다.", 404);
  }

  const input = parsed.value;
  const newPhotoKeys = input.photoKeys.filter(
    (key) => !existing.photo_keys.includes(key)
  );
  if (newPhotoKeys.length > 0) {
    const verified = await verifyUploadIntents(supabase, {
      keys: newPhotoKeys,
      purpose: "sighting_photo",
      userId: user.id,
      ipHash: sha256(await getClientIp()),
    });
    if (!verified.ok) {
      const unavailable =
        verified.reason === "verification_unavailable" ||
        verified.reason === "object_unavailable";
      return fail(
        unavailable
          ? ApiErrorCode.SERVICE_UNAVAILABLE
          : ApiErrorCode.VALIDATION_ERROR,
        unavailable
          ? "업로드 파일을 확인할 수 없습니다."
          : "업로드 파일이 발급 정보와 일치하지 않습니다.",
        unavailable ? 503 : 400
      );
    }
  }

  const traitTags = input.traitTags
    .filter((tag) => TRAIT_TAG_IDS.includes(tag))
    .slice(0, 5);
  const traitSize = normalizeSize(input.traitSize) ?? input.traitSize;
  const colorTokens = input.traitColor
    ? extractColorTokens(input.traitColor)
    : [];
  const requestHash = sha256(
    JSON.stringify({ sightingId, actorId: user.id, ...input })
  );
  const { data, error } = await supabase.rpc("update_owned_sighting", {
    p_actor_id: user.id,
    p_sighting_id: sightingId,
    p_photo_keys: input.photoKeys,
    p_occurred_at: input.occurredAt,
    p_lat: input.location.lat,
    p_lng: input.location.lng,
    p_trait_color: input.traitColor,
    p_trait_size: traitSize,
    p_trait_species: input.traitSpecies,
    p_trait_tags: traitTags,
    p_color_tokens: colorTokens,
    p_note: input.note,
    p_idempotency_key: idempotencyKey,
    p_request_hash: requestHash,
  });
  if (error || !data) {
    logger.error("sighting.update_failed", {
      error,
      status: 500,
    });
    return mutationError(error, "수정 처리에 실패했습니다.");
  }
  triggerEmbeddingsProcess(logger);
  return ok(data);
}

export async function DELETE(request: Request, context: RouteContext) {
  const logger = createRequestLogger(
    request,
    "/api/v1/me/sightings/[sightingId]"
  );
  const { sightingId } = await context.params;
  const { supabase, user } = await authenticate(request);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }
  if (!isValidUuid(sightingId)) {
    return fail(ApiErrorCode.INVALID_PARAMS, "유효하지 않은 요청입니다.", 400);
  }
  const idempotencyKey = request.headers.get("Idempotency-Key")?.trim();
  if (!idempotencyKey || !isValidUuid(idempotencyKey)) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "유효한 Idempotency-Key가 필요합니다.",
      400
    );
  }
  const { data, error } = await supabase.rpc("delete_owned_sighting", {
    p_actor_id: user.id,
    p_sighting_id: sightingId,
    p_idempotency_key: idempotencyKey,
    p_request_hash: sha256(
      JSON.stringify({ sightingId, actorId: user.id, action: "delete" })
    ),
  });
  if (error || !data) {
    logger.error("sighting.delete_failed", { error, status: 500 });
    return mutationError(error, "삭제 처리에 실패했습니다.");
  }
  return ok(data);
}
