import { createServerSupabase } from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

export async function POST(request: Request) {
  const supabase = createServerSupabase();

  try {
    const { photoKeys, location, occurredAt, note } = await request.json();

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
          note: note || null,
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

    return ok(data);
  } catch (err) {
    console.error(err);
    return fail(ApiErrorCode.INTERNAL_ERROR, "서버 오류가 발생했습니다.", 500);
  }
}
