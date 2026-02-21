import { NextResponse } from "next/server";

/**
 * GET /api/v1/search/local?query=검색어
 * 네이버 검색 API(지역 검색)로 장소명 검색.
 * 응답의 mapx, mapy는 TM128 좌표이므로 클라이언트에서 naver.maps.TransCoord.fromTM128ToLatLng로 WGS84 변환 후 사용.
 *
 * 환경 변수 (서버) — 반드시 네이버 개발자센터(developers.naver.com) 앱 사용:
 * - NAVER_CLIENT_ID: 내 애플리케이션 > API 설정 > 검색 사용 설정 후 발급된 Client ID
 * - NAVER_CLIENT_SECRET: 동일 앱의 Client Secret
 * ※ 지도 API(NCP) 키와 다릅니다. 검색 API는 developers.naver.com에서만 발급·설정합니다.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const query = searchParams.get("query")?.trim();

  if (!query) {
    return NextResponse.json(
      { error: { message: "query 파라미터가 필요합니다." } },
      { status: 400 }
    );
  }

  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return NextResponse.json(
      {
        error: {
          message:
            "장소 검색이 설정되지 않았습니다. NAVER_CLIENT_ID, NAVER_CLIENT_SECRET을 확인해주세요.",
        },
      },
      { status: 503 }
    );
  }

  try {
    const url = new URL("https://openapi.naver.com/v1/search/local.json");
    url.searchParams.set("query", query);
    url.searchParams.set("display", "10");
    url.searchParams.set("start", "1");
    url.searchParams.set("sort", "random");

    const res = await fetch(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
    });

    if (!res.ok) {
      const text = await res.text();
      const isAuthError =
        res.status === 401 ||
        res.status === 403 ||
        (text && (text.includes("024") || text.includes("Authentication")));
      const hint = isAuthError
        ? "네이버 개발자센터(developers.naver.com)에서 애플리케이션을 등록하고, API 설정에 '검색'을 추가한 뒤 해당 앱의 Client ID·Secret을 NAVER_CLIENT_ID, NAVER_CLIENT_SECRET에 넣어주세요. (지도 API NCP 키와 별도입니다.)"
        : res.status === 403
          ? "API 권한을 확인해주세요."
          : undefined;
      return NextResponse.json(
        {
          error: {
            message: "장소 검색 요청에 실패했습니다.",
            ...(hint && { hint }),
            detail: text,
          },
        },
        { status: res.status >= 500 ? 502 : res.status }
      );
    }

    const data = await res.json();
    const items = (data.items ?? []).map((item: any) => ({
      title: item.title ?? "",
      address: item.address ?? "",
      roadAddress: item.roadAddress ?? "",
      mapx: parseInt(String(item.mapx ?? 0), 10) || 0,
      mapy: parseInt(String(item.mapy ?? 0), 10) || 0,
    }));

    return NextResponse.json({ items });
  } catch (e) {
    console.error("Search local API error:", e);
    return NextResponse.json(
      { error: { message: "장소 검색 중 오류가 발생했습니다." } },
      { status: 500 }
    );
  }
}
