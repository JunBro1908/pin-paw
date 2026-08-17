import {
  createServiceRoleSupabase,
  getVerifiedUser,
} from "@/shared/supabase/server";
import {
  ok,
  fail,
  ApiErrorCode,
  retryAfterHeaders,
} from "@/shared/lib/api-response";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import {
  checkRateLimitDimensions,
  RateLimitPresets,
} from "@/shared/lib/rate-limit";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";
import { extractColorTokens } from "@/shared/constants/traitColors";
import { normalizeSize } from "@/shared/constants/traitSizes";
import { TRAIT_TAG_IDS, TRAIT_TAGS_MAX } from "@/shared/constants/traitTags";
import {
  isValidUuid,
  parseSightingCreateRequest,
} from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { verifyUploadIntents } from "@/shared/lib/upload-intents";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { getIdempotencyReplay } from "@/shared/lib/idempotency";
import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/sightings");
  const supabase = createServiceRoleSupabase();
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
  const parsed = parseSightingCreateRequest(body.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "제보 요청 형식이 유효하지 않습니다.",
      400
    );
  }

  try {
    const {
      photoKeys,
      location,
      occurredAt,
      traitColor,
      traitSize,
      traitSpecies,
      note,
      traitTags,
    } = parsed.value;

    // 1. 인증 확인
    const authHeader = request.headers.get("Authorization");
    let userId = null;
    let authorType: "anon" | "user" = "anon";

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const { user } = await getVerifiedUser(supabase, token);
      if (!user) {
        return fail(
          ApiErrorCode.UNAUTHORIZED,
          "인증 정보가 유효하지 않습니다.",
          401
        );
      }
      if (user) {
        userId = user.id;
        authorType = "user";
      }
    }

    if (photoKeys.length > (userId ? 5 : 1)) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        userId
          ? "로그인 제보 사진은 최대 5장까지 등록할 수 있습니다."
          : "비로그인 제보는 사진 1장만 등록할 수 있습니다.",
        400
      );
    }

    // 1.1 Rate Limit 체크 (IP + 로그인 사용자는 user 이중 제한)
    const ipHash = sha256(await getClientIp());
    const idempotencyHeader = request.headers.get("Idempotency-Key");
    if (idempotencyHeader && !isValidUuid(idempotencyHeader)) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "Idempotency-Key는 UUID 형식이어야 합니다.",
        400
      );
    }
    const idempotencyKey = idempotencyHeader?.trim() || crypto.randomUUID();

    const traitColorNorm = traitColor;
    const colorTokens = traitColorNorm
      ? extractColorTokens(traitColorNorm)
      : [];
    const sizeNorm = normalizeSize(traitSize) ?? null;
    const traitTagsNorm = traitTags
      .filter((id) => TRAIT_TAG_IDS.includes(id))
      .slice(0, TRAIT_TAGS_MAX);
    const requestHash = sha256(
      JSON.stringify({
        photoKeys,
        location,
        occurredAt,
        authorType,
        userId,
        traitColor: traitColorNorm,
        traitSize: sizeNorm ?? traitSize ?? null,
        traitSpecies: traitSpecies ?? null,
        traitTags: traitTagsNorm,
        colorTokens,
        note: note ?? null,
      })
    );
    const replay = await getIdempotencyReplay(
      supabase,
      userId === null
        ? {
            scope: "sighting:submit",
            key: idempotencyKey,
            ownerId: null,
            ipHash,
            requestHash,
          }
        : {
            scope: "sighting:submit",
            key: idempotencyKey,
            ownerId: userId,
            ipHash: null,
            requestHash,
          }
    );
    if (replay.status === "unavailable") {
      return fail(
        ApiErrorCode.SERVICE_UNAVAILABLE,
        "요청 처리 상태를 확인할 수 없습니다.",
        503
      );
    }
    if (replay.status === "conflict") {
      return fail(
        "IDEMPOTENCY_CONFLICT",
        "Idempotency-Key 충돌이 발생했습니다. 동일한 키로 다른 데이터를 전송할 수 없습니다.",
        409
      );
    }
    if (replay.status === "hit") {
      return NextResponse.json(replay.response);
    }

    const rateLimitResult = await checkRateLimitDimensions(
      supabase,
      "sighting:submit",
      ipHash,
      userId,
      RateLimitPresets.sighting
    );

    if (!rateLimitResult.allowed) {
      return fail(
        rateLimitResult.unavailable
          ? ApiErrorCode.SERVICE_UNAVAILABLE
          : ApiErrorCode.RATE_LIMITED,
        rateLimitResult.errorMessage!,
        rateLimitResult.unavailable ? 503 : 429,
        retryAfterHeaders(
          rateLimitResult.retryAfterSeconds,
          rateLimitResult.unavailable
        )
      );
    }

    const uploadVerification = await verifyUploadIntents(supabase, {
      keys: photoKeys,
      purpose: "sighting_photo",
      userId,
      ipHash,
    });
    if (!uploadVerification.ok) {
      const unavailable =
        uploadVerification.reason === "verification_unavailable" ||
        uploadVerification.reason === "object_unavailable";
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

    const { data: rpcData, error } = await supabase.rpc(
      userId ? "create_user_sighting_with_uploads" : "create_sighting_with_uploads",
      {
        p_photo_keys: photoKeys,
        p_author_type: authorType,
        p_user_id: userId,
        p_ip_hash: ipHash,
        p_occurred_at: occurredAt,
        p_lat: location.lat,
        p_lng: location.lng,
        p_trait_color: traitColorNorm,
        p_trait_size: sizeNorm ?? traitSize ?? null,
        p_trait_species: traitSpecies ?? null,
        p_trait_tags: traitTagsNorm,
        p_color_tokens: colorTokens,
        p_note: note ?? null,
        p_idempotency_key: idempotencyKey,
        p_request_hash: requestHash,
      }
    );
    const data = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (error || !data) {
      logger.error("sighting.create_failed", { error, status: 500 });
      if (error?.message?.includes("idempotency_conflict")) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key 충돌이 발생했습니다. 동일한 키로 다른 데이터를 전송할 수 없습니다.",
          409
        );
      }
      if (error?.message?.includes("invalid_upload_intent")) {
        return fail(
          "UPLOAD_INTENT_CONFLICT",
          "이미 사용되었거나 만료된 업로드입니다.",
          409
        );
      }
      return fail(
        ApiErrorCode.INTERNAL_ERROR,
        "제보 저장에 실패했습니다.",
        500
      );
    }

    // 도메인 행, 업로드 소비, 임베딩 job, 멱등 응답은 RPC에서 원자적으로 저장한다.
    triggerEmbeddingsProcess(logger);

    return ok(data);
  } catch (err) {
    logger.error("sighting.unhandled", { error: err, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "서버 오류가 발생했습니다.", 500);
  }
}
