import { NextResponse } from "next/server";
import { createServerSupabase } from "@/shared/supabase/server";
import { ApiResponse } from "@/shared/types/api";
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
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: {
          code: "INVALID_PARAMS",
          message: "필수 파라미터가 누락되었거나 유효하지 않습니다.",
        },
      },
      { status: 400 }
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
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: {
          code: "INVALID_RANGE",
          message: "위경도 범위가 유효하지 않습니다.",
        },
      },
      { status: 400 }
    );
  }

  const supabase = createServerSupabase();

  // Rate Limit Placeholder
  // TODO: Implement rate limiting for public endpoint

  try {
    // 2. 데이터 조회 및 클러스터링 (RPC 호출)
    // NOTE: DB에 'get_sightings_clusters' RPC가 정의되어 있어야 합니다.
    const { data, error } = await supabase.rpc("get_sightings_clusters", {
      min_lat: minLat,
      min_lng: minLng,
      max_lat: maxLat,
      max_lng: maxLng,
      zoom_level: zoom,
    });

    if (error) {
      console.error("Clusters fetch error:", error);
      throw new Error("데이터를 가져오는 중 오류가 발생했습니다.");
    }

    const clusters = data || [];

    // 3. ETag 생성
    // 데이터의 해시와 입력 파라미터를 조합하여 생성합니다.
    const contentHash = crypto
      .createHash("md5")
      .update(JSON.stringify(clusters) + searchParams.toString())
      .digest("hex");
    const etag = `W/"${contentHash}"`;

    // 4. If-None-Match 확인 (캐시 처리)
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return new NextResponse(null, { status: 304 });
    }

    // 5. 응답 반환
    const response: ApiResponse = {
      ok: true,
      data: {
        clusters,
      },
    };

    return NextResponse.json(response, {
      headers: {
        ETag: etag,
        "Cache-Control": "public, max-age=0, must-revalidate", // ETag를 통한 조건부 요청 유도
      },
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json<ApiResponse>(
      {
        ok: false,
        error: {
          code: "INTERNAL_SERVER_ERROR",
          message: "서버 내부 오류가 발생했습니다.",
        },
      },
      { status: 500 }
    );
  } 
}
