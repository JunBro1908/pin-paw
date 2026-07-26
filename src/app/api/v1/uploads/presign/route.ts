import {
  createServiceRoleSupabase,
  getVerifiedUser,
} from "@/shared/supabase/server";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import {
  checkRateLimitDimensions,
  RateLimitPresets,
} from "@/shared/lib/rate-limit";
import { NextResponse } from "next/server";
import { isValidUuid, parseUploadRequest } from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { createRequestLogger } from "@/shared/lib/structured-log";

const SCOPE = "uploads:presign";
const UPLOAD_INTENT_TTL_MS = 15 * 60 * 1000;

const BUCKET_MAPPING = {
  sighting_photo: "sightings",
  lost_cover: "lost",
};

export async function POST(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/uploads/presign");
  const supabase = createServiceRoleSupabase();
  const now = new Date();
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
  const parsed = parseUploadRequest(body.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "업로드 요청 형식이 유효하지 않습니다.",
      400
    );
  }
  const { purpose, files } = parsed.value;

  try {
    // 2. 사용자 식별
    const authHeader = request.headers.get("Authorization");
    const { user } = authHeader
      ? await getVerifiedUser(supabase, authHeader.replace("Bearer ", ""))
      : { user: null };
    if (authHeader && !user) {
      return fail(
        ApiErrorCode.UNAUTHORIZED,
        "인증 정보가 유효하지 않습니다.",
        401
      );
    }
    const userId = user?.id || null;
    const ip = await getClientIp();
    const ipHash = sha256(ip);

    const idempotencyHeader = request.headers.get("Idempotency-Key");
    if (idempotencyHeader && !isValidUuid(idempotencyHeader)) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "Idempotency-Key는 UUID 형식이어야 합니다.",
        400
      );
    }
    const idempotencyKey = idempotencyHeader?.trim() || crypto.randomUUID();
    const requestHash = sha256(
      JSON.stringify({ purpose, files, userId, ipHash })
    );

    // 멱등성 체크: 키가 이미 존재하는지 확인 (request_hash도 반드시 포함!)
    const { data: cached } = await supabase
      .from("idempotency_keys")
      .select("response, request_hash")
      .eq("scope", SCOPE)
      .eq("key", idempotencyKey)
      .maybeSingle();

    if (cached) {
      // 1. 키는 같은데 내용(파일 등)이 다른 경우 -> 409 충돌!
      if (cached.request_hash !== requestHash) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key 충돌이 발생했습니다. 동일한 키로 다른 데이터를 전송할 수 없습니다.",
          409
        );
      }
      // 2. 키도 같고 내용도 같은 경우 -> 기존 응답 그대로 반환 (성공)
      return NextResponse.json(cached.response);
    }

    // 2.5 Rate Limit 체크 (DB 기반, IP + 로그인 사용자는 user 이중 제한)
    const rateLimitResult = await checkRateLimitDimensions(
      supabase,
      SCOPE,
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
        rateLimitResult.unavailable ? 503 : 429
      );
    }

    // 3. Intent를 먼저 기록한 뒤 Presigned URL 생성
    const dateStr = now.toISOString().split("T")[0].replace(/-/g, "");
    const bucket = BUCKET_MAPPING[purpose];
    const expiresAt = new Date(now.getTime() + UPLOAD_INTENT_TTL_MS);
    const plannedUploads = files.map((file) => {
      const ext = file.contentType === "image/jpeg" ? "jpg" : "png";
      return {
        file,
        fileKey: `${purpose}/${dateStr}/${crypto.randomUUID()}.${ext}`,
      };
    });

    const { error: intentError } = await supabase.from("upload_intents").insert(
      plannedUploads.map(({ file, fileKey }) => ({
        object_key: fileKey,
        bucket_id: bucket,
        purpose,
        owner_id: userId,
        ip_hash: ipHash,
        expected_content_type: file.contentType,
        expected_size_bytes: file.sizeBytes,
        expires_at: expiresAt.toISOString(),
      }))
    );
    if (intentError) {
      logger.error("upload.intent_save_failed", {
        error: intentError,
        status: 500,
      });
      return fail(
        ApiErrorCode.INTERNAL_ERROR,
        "업로드 준비에 실패했습니다.",
        500
      );
    }

    const uploads = [];
    try {
      for (const { fileKey } of plannedUploads) {
        const { data, error } = await supabase.storage
          .from(bucket)
          .createSignedUploadUrl(fileKey, { upsert: false });

        if (error) throw error;

        uploads.push({
          fileKey,
          uploadUrl: data.signedUrl,
          expiresAt: expiresAt.toISOString(),
        });
      }
    } catch (error) {
      await supabase
        .from("upload_intents")
        .delete()
        .in(
          "object_key",
          plannedUploads.map(({ fileKey }) => fileKey)
        );
      throw error;
    }

    const responseData = { uploads };
    const responseMeta = { serverTime: now.toISOString() };

    // 4. 결과 저장 (멱등성)
    const finalResponse = {
      success: true,
      data: responseData,
      meta: responseMeta,
    };

    const { error: idempotencyError } = await supabase
      .from("idempotency_keys")
      .insert({
        scope: SCOPE,
        key: idempotencyKey,
        owner_id: userId,
        ip_hash: ipHash,
        request_hash: requestHash,
        response: finalResponse,
        expires_at: expiresAt.toISOString(),
      });

    if (idempotencyError) {
      logger.error("upload.idempotency_save_failed", {
        error: idempotencyError,
        status: 500,
      });
      return fail(
        ApiErrorCode.INTERNAL_ERROR,
        "보안 키 저장에 실패했습니다.",
        500
      );
    }

    return ok(responseData, responseMeta);
  } catch (err) {
    logger.error("upload.presign_unhandled", { error: err, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "서버 오류가 발생했습니다.", 500);
  }
}
