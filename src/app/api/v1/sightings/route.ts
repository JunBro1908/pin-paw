import { createServerSupabase } from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import { checkRateLimit, RateLimitPresets } from "@/shared/lib/rate-limit";

export async function POST(request: Request) {
  const supabase = createServerSupabase();

  try {
    const {
      photoKeys,
      location,
      occurredAt,
      traitColor,
      traitSize,
      traitSpecies,
      note,
    } = await request.json();

    if (!photoKeys || !location || !occurredAt) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "필수 데이터가 누락되었습니다.",
        400
      );
    }

    // 1. 인증 확인
    const authHeader = request.headers.get("Authorization");
    let userId = null;
    let authorType: "anon" | "user" = "anon";

    if (authHeader) {
      const token = authHeader.replace("Bearer ", "");
      const {
        data: { user },
      } = await supabase.auth.getUser(token);
      if (user) {
        userId = user.id;
        authorType = "user";
      }
    }

    // 1.1 Rate Limit 체크 (비회원만 적용, DB 기반)
    // presign에서 이미 체크했으므로 여기서는 추가 검증만 수행
    let ipHash: string | null = null;
    if (authorType === "anon") {
      const ip = await getClientIp();
      ipHash = sha256(ip);
      const SIGHTING_SCOPE = "sighting:submit";

      const rateLimitResult = await checkRateLimit(
        supabase,
        SIGHTING_SCOPE,
        ipHash,
        null,
        RateLimitPresets.sighting
      );

      if (!rateLimitResult.allowed) {
        return fail(
          ApiErrorCode.RATE_LIMITED,
          rateLimitResult.errorMessage!,
          429
        );
      }
    }

    // PostGIS geography 포인트 생성 (SRID 4326)
    const geographyPoint = `POINT(${location.lng} ${location.lat})`;

    const { data, error } = await supabase
      .from("sightings")
      .insert([
        {
          author_type: authorType,
          user_id: userId,
          occurred_at: occurredAt,
          location: geographyPoint,
          photo_keys: photoKeys,
          trait_color: traitColor ?? null,
          trait_size: traitSize ?? null,
          trait_species: traitSpecies ?? null,
          note: note ?? null,
          embedding_status: "pending",
        },
      ])
      .select()
      .single();

    if (error) {
      console.error(error);
      return fail(
        ApiErrorCode.INTERNAL_ERROR,
        "제보 저장에 실패했습니다.",
        500
      );
    }

    // Rate Limit 추적을 위한 기록 (비회원만)
    if (authorType === "anon" && ipHash) {
      const now = new Date();
      const SIGHTING_SCOPE = "sighting:submit";

      await supabase.from("idempotency_keys").insert({
        scope: SIGHTING_SCOPE,
        key: crypto.randomUUID(),
        owner_id: null,
        ip_hash: ipHash,
        request_hash: sha256(
          JSON.stringify({ photoKeys, location, occurredAt })
        ),
        response: { success: true, data },
        expires_at: new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString(), // 24시간
      });
    }

    return ok(data);
  } catch (err) {
    console.error(err);
    return fail(ApiErrorCode.INTERNAL_ERROR, "서버 오류가 발생했습니다.", 500);
  }
}
