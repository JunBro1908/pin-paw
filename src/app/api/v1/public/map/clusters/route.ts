import { NextResponse } from "next/server";
import { createServiceRoleSupabase } from "@/shared/supabase/server";
import { fail, notModified, ApiErrorCode } from "@/shared/lib/api-response";
import { parseMapViewportQuery } from "@/shared/lib/public-api-guard";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import { checkRateLimit, RateLimitPresets } from "@/shared/lib/rate-limit";
import { createRequestLogger } from "@/shared/lib/structured-log";
import crypto from "crypto";

/**
 * GET /api/v1/public/map/clusters
 * 지도상의 목격 제보를 클러스터링하여 반환합니다.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/public/map/clusters"
  );
  const { searchParams } = new URL(request.url);

  const viewportResult = parseMapViewportQuery({
    minLat: searchParams.get("minLat"),
    minLng: searchParams.get("minLng"),
    maxLat: searchParams.get("maxLat"),
    maxLng: searchParams.get("maxLng"),
    zoom: searchParams.get("zoom"),
  });
  if (!viewportResult.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      viewportResult.reason === "bbox_too_large"
        ? "지도 조회 범위는 위도·경도 각각 2도 이하여야 합니다."
        : "지도 범위 또는 zoom이 유효하지 않습니다.",
      400
    );
  }
  const { minLat, minLng, maxLat, maxLng, zoom } = viewportResult.viewport;

  const supabase = createServiceRoleSupabase();
  const rateLimit = await checkRateLimit(
    supabase,
    "map:public",
    sha256(await getClientIp()),
    null,
    RateLimitPresets.map
  );
  if (!rateLimit.allowed) {
    return fail(
      rateLimit.unavailable
        ? ApiErrorCode.SERVICE_UNAVAILABLE
        : ApiErrorCode.RATE_LIMITED,
      rateLimit.errorMessage ?? "지도 요청을 처리할 수 없습니다.",
      rateLimit.unavailable ? 503 : 429
    );
  }

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
      // 네트워크/DNS 오류 (Supabase에 연결 불가)
      const isNetworkError =
        error.message?.includes("fetch failed") ||
        String(error.details ?? "").includes("ENOTFOUND") ||
        String(error.details ?? "").includes("ECONNREFUSED");
      logger.error("map.public_clusters_failed", {
        error,
        networkUnavailable: isNetworkError,
        status: isNetworkError ? 503 : 502,
      });

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
    logger.error("map.public_clusters_unhandled", {
      error: err,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "서버 내부 오류가 발생했습니다.",
      500
    );
  }
}
