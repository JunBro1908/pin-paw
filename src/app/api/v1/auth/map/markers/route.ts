import { NextResponse } from "next/server";
import {
  createServerSupabase,
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { fail, notModified, ApiErrorCode } from "@/shared/lib/api-response";
import crypto from "crypto";

/**
 * GET /api/v1/auth/map/markers
 * 인증된 사용자를 위한 상세 목격 제보 마커 데이터를 반환합니다.
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

  // RPC 호출용 Service Role 클라이언트
  const supabase = createServerSupabase();

  const { searchParams } = new URL(request.url);
  const minLat = parseFloat(searchParams.get("minLat") || "");
  const minLng = parseFloat(searchParams.get("minLng") || "");
  const maxLat = parseFloat(searchParams.get("maxLat") || "");
  const maxLng = parseFloat(searchParams.get("maxLng") || "");
  const zoom = parseInt(searchParams.get("zoom") || "");

  // 2. 파라미터 유효성 검사
  if (
    isNaN(minLat) ||
    isNaN(minLng) ||
    isNaN(maxLat) ||
    isNaN(maxLng) ||
    isNaN(zoom)
  ) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "필수 파라미터가 유효하지 않습니다.",
      400
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

    if (error) {
      console.error("Auth markers fetch error:", error);
      const isNetworkError =
        error.message?.includes("fetch failed") ||
        String(error.details ?? "").includes("ENOTFOUND") ||
        String(error.details ?? "").includes("ECONNREFUSED");
      if (isNetworkError) {
        return fail(
          ApiErrorCode.SERVICE_UNAVAILABLE,
          "지도 데이터를 불러올 수 없습니다. 인터넷 연결을 확인해 주세요.",
          503
        );
      }
      return fail(
        ApiErrorCode.UPSTREAM_ERROR,
        "데이터를 가져오는 중 오류가 발생했습니다.",
        502
      );
    }

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
      return notModified();
    }

    return NextResponse.json(
      {
        success: true,
        data: { clusters },
      },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "private, max-age=0, must-revalidate",
        },
      }
    );
  } catch (err) {
    console.error("Auth markers fetch error:", err);
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "데이터를 가져오는 중 오류가 발생했습니다.",
      500
    );
  }
}
