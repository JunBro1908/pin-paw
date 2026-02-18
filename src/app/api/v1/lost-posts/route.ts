import { NextResponse } from "next/server";
import {
  createServerSupabase,
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { sha256 } from "@/shared/lib/hash";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";

const SCOPE = "lost-posts:create";
const IDEMPOTENCY_TTL_MS = 24 * 60 * 60 * 1000; // 24h

const UUID_REGEX =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseIdempotencyKey(header: string | null): string {
  if (header && UUID_REGEX.test(header.trim())) return header.trim();
  return crypto.randomUUID();
}

/**
 * POST /api/v1/lost-posts — 유실글 생성 (인증 필수)
 * Body: { coverPhotoKey, lostAt, lostLocation: { lat, lng }, traitColor?, traitSize?, traitSpecies? }
 * Header: Idempotency-Key (optional, UUID)
 */
export async function POST(request: Request) {
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const supabaseAdmin = createServerSupabase();
  const now = new Date();

  try {
    const body = await request.json();
    const {
      coverPhotoKey,
      lostAt,
      lostLocation,
      petName,
      traitColor,
      traitSize,
      traitSpecies,
      note,
    } = body;

    if (!coverPhotoKey || !lostAt || !lostLocation) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "coverPhotoKey, lostAt, lostLocation은 필수입니다.",
        400
      );
    }
    const petNameTrimmed = typeof petName === "string" ? petName.trim() : "";
    if (!petNameTrimmed) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "강아지 이름(petName)은 필수입니다.",
        400
      );
    }

    const lat = Number(lostLocation.lat);
    const lng = Number(lostLocation.lng);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "lostLocation.lat, lostLocation.lng는 숫자여야 합니다.",
        400
      );
    }

    const idempotencyKey = parseIdempotencyKey(
      request.headers.get("Idempotency-Key")
    );
    const requestHash = sha256(
      JSON.stringify({
        coverPhotoKey,
        lostAt,
        lostLocation: { lat, lng },
        petName: petNameTrimmed,
        traitColor: traitColor ?? null,
        traitSize: traitSize ?? null,
        traitSpecies: traitSpecies ?? null,
        note: note ?? null,
      })
    );

    const { data: cached } = await supabaseAdmin
      .from("idempotency_keys")
      .select("response, request_hash")
      .eq("scope", SCOPE)
      .eq("key", idempotencyKey)
      .eq("owner_id", user.id)
      .maybeSingle();

    if (cached) {
      if (cached.request_hash !== requestHash) {
        return fail(
          "IDEMPOTENCY_CONFLICT",
          "Idempotency-Key 충돌이 발생했습니다. 동일한 키로 다른 데이터를 전송할 수 없습니다.",
          409
        );
      }
      return NextResponse.json(cached.response);
    }

    const lostLocationWkt = `POINT(${lng} ${lat})`;

    const { data: row, error } = await supabaseAuth
      .from("lost_posts")
      .insert({
        owner_id: user.id,
        cover_photo_key: coverPhotoKey,
        pet_name: petNameTrimmed,
        lost_at: lostAt,
        lost_location: lostLocationWkt,
        trait_color: traitColor ?? null,
        trait_size: traitSize ?? null,
        trait_species: traitSpecies ?? null,
        note: note ?? null,
        status: "searching",
        embedding_status: "pending",
      })
      .select()
      .single();

    if (error) {
      console.error("[lost-posts POST]", error);
      return fail(
        ApiErrorCode.INTERNAL_ERROR,
        "유실글 저장에 실패했습니다.",
        500
      );
    }

    const responsePayload = { success: true as const, data: row };
    await supabaseAdmin.from("idempotency_keys").insert({
      scope: SCOPE,
      key: idempotencyKey,
      owner_id: user.id,
      ip_hash: null,
      request_hash: requestHash,
      response: responsePayload,
      expires_at: new Date(now.getTime() + IDEMPOTENCY_TTL_MS).toISOString(),
    });

    // 임베딩: pending 삽입 후 worker fire-and-forget
    await supabaseAdmin.from("embeddings").upsert(
      {
        entity_type: "lost_post",
        entity_id: row.id,
        modality: "text",
        status: "pending",
        retry_count: 0,
      },
      { onConflict: "entity_type,entity_id,modality" }
    );
    triggerEmbeddingsProcess(request);

    return NextResponse.json(responsePayload, { status: 201 });
  } catch (err) {
    console.error("[lost-posts POST]", err);
    return fail(ApiErrorCode.INTERNAL_ERROR, "서버 오류가 발생했습니다.", 500);
  }
}

/**
 * GET /api/v1/lost-posts — 내 유실글 목록 (인증 필수)
 * Query: limit (default 20), offset (default 0)
 */
export async function GET(request: Request) {
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
  const limit = Math.min(
    Math.max(1, parseInt(searchParams.get("limit") || "20", 10)),
    100
  );
  const offset = Math.max(0, parseInt(searchParams.get("offset") || "0", 10));

  const { data: rows, error } = await supabaseAuth
    .from("lost_posts")
    .select(
      "id, cover_photo_key, pet_name, lost_at, lost_location, trait_color, trait_size, trait_species, note, status, embedding_status, created_at, updated_at"
    )
    .order("created_at", { ascending: false })
    .range(offset, offset + limit - 1);

  if (error) {
    console.error("[lost-posts GET]", error);
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "목록을 불러오는 중 오류가 발생했습니다.",
      500
    );
  }

  const list = rows ?? [];
  return ok(list, { limit, offset });
}
