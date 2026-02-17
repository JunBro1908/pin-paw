import { NextResponse } from "next/server";
import { createServerSupabase } from "@/shared/supabase/server";
import { fail, notModified, ApiErrorCode } from "@/shared/lib/api-response";
import crypto from "crypto";

/**
 * GET /api/v1/public/map/clusters
 * 지도상의 목격 제보를 클러스터링하여 반환합니다.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);

  const minLat = parseFloat(searchParams.get("minLat") || "");
  const minLng = parseFloat(searchParams.get("minLng") || "");
  const maxLat = parseFloat(searchParams.get("maxLat") || "");
  const maxLng = parseFloat(searchParams.get("maxLng") || "");
  const zoom = parseInt(searchParams.get("zoom") || "");

  // 1. 파라미터 유효성 검사
  if (
    isNaN(minLat) ||
    isNaN(minLng) ||
    isNaN(maxLat) ||
    isNaN(maxLng) ||
    isNaN(zoom)
  ) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "필수 파라미터가 누락되었거나 유효하지 않습니다.",
      400
    );
  }

  // 범위 검사 (기본적인 위경도 범위)
  if (
    minLat < -90 ||
    maxLat > 90 ||
    minLng < -180 ||
    maxLng > 180 ||
    minLat > maxLat ||
    minLng > maxLng
  ) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "위경도 범위가 유효하지 않습니다.",
      400
    );
  }

  const supabase = createServerSupabase();

  try {
    // 2. 데이터 조회 및 클러스터링 (RPC 호출)
    const { data, error } = await supabase.rpc("get_sighting_clusters", {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
      zoom_level: zoom,
      is_public: true,
    });

    if (error) {
      console.error("Clusters fetch error:", error);

      // 네트워크/DNS 오류 (Supabase에 연결 불가)
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

    // 3. ETag 생성
    const contentHash = crypto
      .createHash("md5")
      .update(JSON.stringify(clusters))
      .digest("hex");
    const etag = `W/"${contentHash}"`;

    // 4. If-None-Match 확인 (캐시 처리)
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return notModified();
    }

    // 5. 응답 반환
    return NextResponse.json(
      {
        success: true,
        data: { clusters },
      },
      {
        headers: {
          ETag: etag,
          "Cache-Control": "public, max-age=0, must-revalidate", // ETag를 통한 조건부 요청 유도
        },
      }
    );
  } catch (err) {
    console.error(err);
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
}
