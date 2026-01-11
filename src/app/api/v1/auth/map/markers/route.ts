import { NextResponse } from "next/server";
import { createServerSupabase } from "@/shared/supabase/server";
import { ApiResponse } from "@/shared/types/api";
import crypto from "crypto";

/**
 * GET /api/v1/auth/map/markers
 * 인증된 사용자를 위한 상세 목격 제보 마커 데이터를 반환합니다.
 */
export async function GET(request: Request) {
  const supabase = createServerSupabase();

  // 1. 세션 확인 (인증 여부 검사)
  const { data: { session } } = await supabase.auth.getSession();
  if (!session) {
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: {
          code: "UNAUTHORIZED",
          message: "로그인이 필요한 서비스입니다.",
        },
      },
      { status: 401 }
    );
  }

  const { searchParams } = new URL(request.url);
  const minLat = parseFloat(searchParams.get("minLat") || "");
  const minLng = parseFloat(searchParams.get("minLng") || "");
  const maxLat = parseFloat(searchParams.get("maxLat") || "");
  const maxLng = parseFloat(searchParams.get("maxLng") || "");
  const zoom = parseInt(searchParams.get("zoom") || "");

  // 2. 파라미터 유효성 검사
  if (isNaN(minLat) || isNaN(minLng) || isNaN(maxLat) || isNaN(maxLng) || isNaN(zoom)) {
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: {
          code: "INVALID_PARAMS",
          message: "필수 파라미터가 유효하지 않습니다.",
        },
      },
      { status: 400 }
    );
  }

  try {
    // 3. 데이터 조회 (is_public: false로 상세 데이터 요청)
    const { data, error } = await supabase.rpc("get_sighting_clusters", {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
      zoom_level: zoom,
      is_public: false, // 인증 유저용 상세 데이터
    });

    if (error) throw error;

    const clusters = data || [];

    // 4. ETag 생성 (데이터 기반)
    const contentHash = crypto
      .createHash("md5")
      .update(JSON.stringify(clusters))
      .digest("hex");
    const etag = `W/"${contentHash}"`;

    // 5. If-None-Match 확인
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }

    const response: ApiResponse = {
      ok: true,
      data: { clusters },
    };

    return NextResponse.json(response, {
      headers: {
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      },
    });
  } catch (err) {
    console.error("Auth markers fetch error:", err);
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "데이터를 가져오는 중 오류가 발생했습니다.",
        },
      },
      { status: 500 }
    );
  }
}

