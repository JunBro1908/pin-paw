import { NextResponse } from "next/server";
import { normalizeSearchQuery } from "@/shared/lib/public-api-guard";
import { createServiceRoleSupabase } from "@/shared/supabase/server";
import { getClientIp } from "@/shared/lib/ip";
import { sha256 } from "@/shared/lib/hash";
import { checkRateLimit, RateLimitPresets } from "@/shared/lib/rate-limit";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  COST_ESTIMATES_USD_MICROS,
  recordOperationalCounter,
} from "@/shared/lib/operational-metrics";
import { getNaverSearchCredentials } from "@/shared/lib/naver-credentials";

interface NaverLocalSearchItem {
  title?: string;
  address?: string;
  roadAddress?: string;
  mapx?: string | number;
  mapy?: string | number;
}

interface NaverLocalSearchResponse {
  items?: NaverLocalSearchItem[];
}

/** 네이버 검색 하이라이트(<b>…</b>)·간단 HTML 엔티티 제거 */
function stripNaverSearchMarkup(value: string): string {
  return value
    .replace(/<[^>]*>/g, "")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * GET /api/v1/search/local?query=검색어
 * 네이버 검색 API(지역 검색)로 장소명 검색.
 * 2023-08 이후 mapx/mapy는 WGS84 * 1e7 정수입니다.
 *
 * 검색용 환경 변수 (developers.naver.com):
 * - NEXT_PUBLIC_NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
 * - fallback: NAVER_CLIENT_ID / NAVER_CLIENT_SECRET
 * ※ 지도 NCP 키(NEXT_PUBLIC_NAVER_MAP_CLIENT_ID)와 별개입니다.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/search/local");
  const { searchParams } = new URL(request.url);
  const queryResult = normalizeSearchQuery(searchParams.get("query"));

  if (!queryResult.ok) {
    return NextResponse.json(
      {
        error: {
          message:
            queryResult.reason === "query_missing"
              ? "query 파라미터가 필요합니다."
              : "query 파라미터가 유효하지 않습니다.",
        },
      },
      { status: 400 }
    );
  }
  const query = queryResult.query;
  const supabase = createServiceRoleSupabase();
  const ipHash = sha256(await getClientIp());
  const rateLimit = await checkRateLimit(
    supabase,
    "search:local",
    ipHash,
    null,
    RateLimitPresets.search
  );
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: { message: rateLimit.errorMessage } },
      {
        status: rateLimit.unavailable ? 503 : 429,
        headers: rateLimit.retryAfterSeconds
          ? { "Retry-After": String(rateLimit.retryAfterSeconds) }
          : undefined,
      }
    );
  }

  const { clientId, clientSecret } = getNaverSearchCredentials();

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: {
          message:
            "장소 검색이 설정되지 않았습니다. NEXT_PUBLIC_NAVER_CLIENT_ID, NAVER_CLIENT_SECRET을 확인해주세요.",
        },
      },
      { status: 503 }
    );
  }

  try {
    const url = new URL("https://openapi.naver.com/v1/search/local.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "5");
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "random");

    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      signal: AbortSignal.timeout(5000),
    });
    const metricRecorded = await recordOperationalCounter(supabase, {
      metric: "naver_local_search",
      estimatedCostUsdMicros: COST_ESTIMATES_USD_MICROS.naverLocalSearchRequest,
    });
    if (!metricRecorded) {
      logger.warn("search.cost_metric_failed");
    }

    if (!res.ok) {
      const text = await res.text();
      const isAuthError =
        res.status === 401 ||
        res.status === 403 ||
        (text && (text.includes("024") || text.includes("Authentication")));
      const hint = isAuthError
        ? "네이버 개발자센터(developers.naver.com)에서 검색 API가 켜진 앱의 Client ID·Secret을 NEXT_PUBLIC_NAVER_CLIENT_ID, NAVER_CLIENT_SECRET에 넣어주세요. (지도 NCP 키와 별도입니다.)"
        : res.status === 403
          ? "API 권한을 확인해주세요."
          : undefined;
      return NextResponse.json(
        {
          error: {
            message: "장소 검색 요청에 실패했습니다.",
            ...(hint && { hint }),
          },
        },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = (await res.json()) as NaverLocalSearchResponse;
    const items = (data.items ?? []).map((item) => ({
      title: stripNaverSearchMarkup(item.title ?? ""),
      address: stripNaverSearchMarkup(item.address ?? ""),
      roadAddress: stripNaverSearchMarkup(item.roadAddress ?? ""),
      mapx: parseInt(String(item.mapx ?? 0), 10) || 0,
      mapy: parseInt(String(item.mapy ?? 0), 10) || 0,
    }));

    return NextResponse.json({ items });
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    logger.error("search.local_failed", {
      error,
      timedOut,
      status: timedOut ? 504 : 500,
    });
    return NextResponse.json(
      {
        error: {
          message: timedOut
            ? "장소 검색 응답 시간이 초과되었습니다."
            : "장소 검색 중 오류가 발생했습니다.",
        },
      },
      { status: timedOut ? 504 : 500 }
    );
  }
}
