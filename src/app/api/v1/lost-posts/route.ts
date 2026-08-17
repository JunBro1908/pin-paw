import { NextResponse } from "next/server";
import {
  createServiceRoleSupabase,
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { sha256 } from "@/shared/lib/hash";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";
import { extractColorTokens } from "@/shared/constants/traitColors";
import { normalizeSize } from "@/shared/constants/traitSizes";
import { TRAIT_TAG_IDS, TRAIT_TAGS_MAX } from "@/shared/constants/traitTags";
import {
  isValidUuid,
  parseLostPostCreateRequest,
  parsePagination,
} from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { verifyUploadIntents } from "@/shared/lib/upload-intents";
import { getClientIp } from "@/shared/lib/ip";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { getIdempotencyReplay } from "@/shared/lib/idempotency";
import { resolveApproxRegionLabel } from "@/shared/lib/approx-region-label";

const APPROXIMATE_REGION_LOOKUP_CONCURRENCY = 4;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  mapper: (item: T) => Promise<R>
): Promise<R[]> {
  const results = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapper(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker)
  );
  return results;
}

function extractPointCoordinates(
  location: unknown
): { lat: number; lng: number } | null {
  if (typeof location === "string") {
    const match = /^POINT\s*\(\s*([-+\d.]+)\s+([-+\d.]+)\s*\)$/i.exec(
      location.trim()
    );
    if (!match) return null;
    const lng = Number(match[1]);
    const lat = Number(match[2]);
    return Number.isFinite(lat) && Number.isFinite(lng) ? { lat, lng } : null;
  }
  if (!location || typeof location !== "object") return null;

  const coordinates = (location as { coordinates?: unknown }).coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return null;

  const [lng, lat] = coordinates;
  if (typeof lat !== "number" || typeof lng !== "number") return null;
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return { lat, lng };
}

/**
 * POST /api/v1/lost-posts — 유실글 생성 (인증 필수)
 * Body: { coverPhotoKey, lostAt, lostLocation: { lat, lng }, traitColor?(자유 텍스트), traitSize?, traitSpecies?, note? }
 * Header: Idempotency-Key (optional, UUID)
 */
export async function POST(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/lost-posts");
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const supabaseAdmin = createServiceRoleSupabase();
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
  const parsed = parseLostPostCreateRequest(body.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "유실글 요청 형식이 유효하지 않습니다.",
      400
    );
  }

  try {
    const {
      photoKeys,
      lostAt,
      lostLocation,
      petName,
      traitColor,
      traitSize,
      traitSpecies,
      note,
      traitTags,
    } = parsed.value;
    const petNameTrimmed = petName;
    const { lat, lng } = lostLocation;
    const traitColorNorm = traitColor;
    const colorTokens = traitColorNorm
      ? extractColorTokens(traitColorNorm)
      : [];
    const sizeNorm = normalizeSize(traitSize) ?? null;
    const traitTagsNorm = traitTags
      .filter((id) => TRAIT_TAG_IDS.includes(id))
      .slice(0, TRAIT_TAGS_MAX);

    const idempotencyHeader = request.headers.get("Idempotency-Key");
    if (idempotencyHeader && !isValidUuid(idempotencyHeader)) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "Idempotency-Key는 UUID 형식이어야 합니다.",
        400
      );
    }
    const idempotencyKey = idempotencyHeader?.trim() || crypto.randomUUID();
    const ipHash = sha256(await getClientIp());
    const requestHash = sha256(
      JSON.stringify({
        photoKeys,
        lostAt,
        lostLocation: { lat, lng },
        petName: petNameTrimmed,
        traitColor: traitColorNorm,
        traitSize: sizeNorm ?? traitSize ?? null,
        traitSpecies: traitSpecies ?? null,
        note: note ?? null,
        traitTags: traitTagsNorm,
      })
    );
    const replay = await getIdempotencyReplay(supabaseAdmin, {
      scope: "lost-posts:create",
      key: idempotencyKey,
      ownerId: user.id,
      ipHash: null,
      requestHash,
    });
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

    const uploadVerification = await verifyUploadIntents(supabaseAdmin, {
      keys: photoKeys,
      purpose: "lost_cover",
      userId: user.id,
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

    const { data: rpcData, error } = await supabaseAdmin.rpc(
      "create_lost_post_with_uploads",
      {
        p_photo_keys: photoKeys,
        p_owner_id: user.id,
        p_pet_name: petNameTrimmed,
        p_lost_at: lostAt,
        p_lat: lat,
        p_lng: lng,
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
    const row = Array.isArray(rpcData) ? rpcData[0] : rpcData;

    if (error || !row) {
      logger.error("lost_post.create_failed", { error, status: 500 });
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
        "유실글 저장에 실패했습니다.",
        500
      );
    }

    const responsePayload = { success: true as const, data: row };
    // 도메인 행, 업로드 소비, 임베딩 job, 멱등 응답은 RPC에서 원자적으로 저장한다.
    triggerEmbeddingsProcess(logger);

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err) {
    logger.error("lost_post.create_unhandled", { error: err, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "서버 오류가 발생했습니다.", 500);
  }
}

/**
 * GET /api/v1/lost-posts — 내 유실글 목록 (인증 필수)
 * Query: limit (default 20), offset (default 0)
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/lost-posts");
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const pagination = parsePagination(
    searchParams.get("limit"),
    searchParams.get("offset"),
    20,
    100
  );
  if (!pagination.ok) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "limit과 offset이 유효하지 않습니다.",
      400
    );
  }
  const { limit, offset } = pagination.value;

  const { data: rows, error } = await supabaseAuth
    .from("lost_posts")
    .select(
      "id, cover_photo_key, photo_keys, pet_name, lost_at, lost_location, trait_color, trait_size, trait_species, note, status, embedding_status, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    logger.error("lost_post.list_failed", { error, status: 500 });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "목록을 불러오는 중 오류가 발생했습니다.",
      500
    );
  }

  // Geography serialization differs by PostgREST/runtime. Reuse the owner-only
  // location RPC so the coarse-region lookup receives the same numeric values
  // used by the my-sightings API.
  const { data: locationRows } = await supabaseAuth.rpc(
    "get_my_lost_posts_with_location",
    { limit_count: 100 }
  );
  const coordinatesByLostPostId = new Map<string, { lat: number; lng: number }>();
  for (const locationRow of locationRows ?? []) {
    const lat = Number(locationRow.lat);
    const lng = Number(locationRow.lng);
    if (
      typeof locationRow.id === "string" &&
      Number.isFinite(lat) &&
      Number.isFinite(lng)
    ) {
      coordinatesByLostPostId.set(locationRow.id, { lat, lng });
    }
  }

  const regionByCoordinates = new Map<string, Promise<string | null>>();
  const list = await mapWithConcurrency(
    rows ?? [],
    APPROXIMATE_REGION_LOOKUP_CONCURRENCY,
    async (row) => {
      const point =
        coordinatesByLostPostId.get(row.id) ??
        extractPointCoordinates(row.lost_location);
      let regionLookup: Promise<string | null> | null = null;
      if (point) {
        const key = `${point.lat},${point.lng}`;
        regionLookup = regionByCoordinates.get(key) ?? null;
        if (!regionLookup) {
          regionLookup = resolveApproxRegionLabel(point.lat, point.lng);
          regionByCoordinates.set(key, regionLookup);
        }
      }
      const approximate_region = regionLookup ? await regionLookup : null;

      return { ...row, approximate_region };
    }
  );
  return ok(list, { limit, offset });
}
