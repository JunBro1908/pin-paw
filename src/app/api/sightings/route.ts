import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!, // 서버 전용 env
  process.env.SUPABASE_SERVICE_ROLE_KEY! // 서버 전용 env (절대 NEXT_PUBLIC 금지)
);

export async function POST(request: Request) {
  try {
    const formData = await request.formData();

    const photoVal = formData.get("photo");
    const latVal = formData.get("lat");
    const lngVal = formData.get("lng");
    const occurredVal = formData.get("occurred_at");
    const noteVal = formData.get("note");

    if (!(photoVal instanceof File)) {
      return NextResponse.json(
        { ok: false, error: { message: "photo가 필요합니다." } },
        { status: 400 }
      );
    }
    if (
      typeof latVal !== "string" ||
      typeof lngVal !== "string" ||
      typeof occurredVal !== "string"
    ) {
      return NextResponse.json(
        { ok: false, error: { message: "lat/lng/occurred_at가 필요합니다." } },
        { status: 400 }
      );
    }

    const lat = Number(latVal);
    const lng = Number(lngVal);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) {
      return NextResponse.json(
        { ok: false, error: { message: "lat/lng 형식이 올바르지 않습니다." } },
        { status: 400 }
      );
    }

    const occurred_at = new Date(occurredVal);
    if (Number.isNaN(occurred_at.getTime())) {
      return NextResponse.json(
        {
          ok: false,
          error: { message: "occurred_at 형식이 올바르지 않습니다." },
        },
        { status: 400 }
      );
    }

    const photo = photoVal;
    const fileExt = (photo.name.split(".").pop() || "jpg").toLowerCase();
    const fileKey = `sighting_photo/${Date.now()}-${Math.random().toString(36).slice(2)}.${fileExt}`;

    const bytes = await photo.arrayBuffer();
    const buffer = Buffer.from(bytes);

    const { error: uploadError } = await supabase.storage
      .from("sightings")
      .upload(fileKey, buffer, { contentType: photo.type, upsert: false });

    if (uploadError) {
      return NextResponse.json(
        {
          ok: false,
          error: { message: `이미지 업로드 실패: ${uploadError.message}` },
        },
        { status: 500 }
      );
    }

    const location = `SRID=4326;POINT(${lng} ${lat})`;

    const { data, error: dbError } = await supabase
      .from("sightings")
      .insert([
        {
          author_type: "anon",
          user_id: null,
          occurred_at: occurred_at.toISOString(),
          location,
          photo_keys: [fileKey], // 스키마 준수
          note:
            typeof noteVal === "string" && noteVal.trim()
              ? noteVal.trim()
              : null,
        },
      ])
      .select()
      .single();

    if (dbError) {
      await supabase.storage.from("sightings").remove([fileKey]);
      return NextResponse.json(
        { ok: false, error: { message: `제보 저장 실패: ${dbError.message}` } },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, data });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: { message: "서버 오류가 발생했습니다." } },
      { status: 500 }
    );
  }
}
