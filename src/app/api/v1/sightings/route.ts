import { NextResponse } from "next/server";
import { createServerSupabase } from "@/shared/supabase/server";

export async function POST(request: Request) {
  const supabase = createServerSupabase();

  try {
    const { photoKeys, location, occurredAt, note } = await request.json();

    if (!photoKeys || !location || !occurredAt) {
      return NextResponse.json({ success: false, error: "필수 데이터가 누락되었습니다." }, { status: 400 });
    }

    // PostGIS geography 포인트 생성 (SRID 4326)
    const geographyPoint = `POINT(${location.lng} ${location.lat})`;

    const { data, error } = await supabase
      .from("sightings")
      .insert([
        {
          author_type: "anon", // 익명 제보
          user_id: null,
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
      return NextResponse.json({ success: false, error: "제보 저장에 실패했습니다." }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (err) {
    return NextResponse.json({ success: false, error: "서버 오류가 발생했습니다." }, { status: 500 });
  }
}

