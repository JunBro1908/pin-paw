import { NextResponse } from "next/server";
import {
  createServiceRoleSupabase,
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import {
  fail,
  notModified,
  ApiErrorCode,
  retryAfterHeaders,
} from "@/shared/lib/api-response";
import { parseMapViewportQuery } from "@/shared/lib/public-api-guard";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import {
  checkRateLimitDimensions,
  RateLimitPresets,
} from "@/shared/lib/rate-limit";
import { createRequestLogger } from "@/shared/lib/structured-log";
import crypto from "crypto";

/**
 * GET /api/v1/auth/map/markers
 * 인증된 사용자를 위한 상세 목격 제보 마커 데이터를 반환합니다.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/auth/map/markers");
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  // 원자적 rate limit RPC만 Service Role 경계를 사용합니다.
  const supabaseAdmin = createServiceRoleSupabase();

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
      ApiErrorCode.INVALID_PARAMS,
      viewportResult.reason === "bbox_too_large"
        ? "지도 조회 범위는 위도·경도 각각 2도 이하여야 합니다."
        : "지도 범위 또는 zoom이 유효하지 않습니다.",
      400
    );
  }
  const { minLat, minLng, maxLat, maxLng, zoom } = viewportResult.viewport;

  const ipHash = sha256(await getClientIp());
  const rateLimit = await checkRateLimitDimensions(
    supabaseAdmin,
    "map:auth",
    ipHash,
    user.id,
    RateLimitPresets.map
  );
  if (!rateLimit.allowed) {
    return fail(
      rateLimit.unavailable
        ? ApiErrorCode.SERVICE_UNAVAILABLE
        : ApiErrorCode.RATE_LIMITED,
      rateLimit.errorMessage ?? "지도 요청을 처리할 수 없습니다.",
      rateLimit.unavailable ? 503 : 429,
      retryAfterHeaders(rateLimit.retryAfterSeconds, rateLimit.unavailable)
    );
  }

  try {
    // 데이터 RPC는 세션 JWT의 auth.uid()로 정밀 위치 권한을 결정합니다.
    const { data, error } = await supabaseAuth.rpc(
      "get_block_filtered_sighting_markers",
      {
        p_min_lat: minLat,
        p_min_lng: minLng,
        p_max_lat: maxLat,
        p_max_lng: maxLng,
        p_zoom_level: zoom,
      }
    );

    if (error) {
      const isNetworkError =
        error.message?.includes("fetch failed") ||
        String(error.details ?? "").includes("ENOTFOUND") ||
        String(error.details ?? "").includes("ECONNREFUSED");
      logger.error("map.auth_markers_failed", {
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

    // 4. ETag 생성 (데이터 기반)
    const contentHash = crypto
      .createHash("md5")
      .update(JSON.stringify(clusters))
      .digest("hex");
    const etag = `W/"${contentHash}"`;

    // 5. If-None-Match 확인
    const ifNoneMatch = request.headers.get("if-none-match");
    if (ifNoneMatch === etag) {
      return notModified({
        ETag: etag,
        "Cache-Control": "private, max-age=0, must-revalidate",
      });
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
    logger.error("map.auth_markers_unhandled", {
      error: err,
      status: 500,
    });
    return fail(
      ApiErrorCode.INTERNAL_ERROR,
      "데이터를 가져오는 중 오류가 발생했습니다.",
      500
    );
  }
}
