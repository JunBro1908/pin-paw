/**
 * 대략 좌표 → 시/구 단위 공개 라벨.
 * 정밀 주소·도로명은 쓰지 않는다. 실패 시 null.
 */
export async function resolveApproxRegionLabel(
  lat: number,
  lng: number,
  fetchImpl: typeof fetch = fetch
): Promise<string | null> {
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  const url = new URL("https://nominatim.openstreetmap.org/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("accept-language", "ko");
  url.searchParams.set("zoom", "12");

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 2500);
    const response = await fetchImpl(url.toString(), {
      headers: {
        Accept: "application/json",
        "User-Agent": "PinPawSharePreview/1.0 (lost-pet public teaser)",
      },
      signal: controller.signal,
      cache: "force-cache",
    });
    clearTimeout(timer);
    if (!response.ok) return null;

    const payload = (await response.json()) as {
      address?: Record<string, string | undefined>;
    };
    return formatKoreanRegionLabel(payload.address ?? {});
  } catch {
    return null;
  }
}

export function formatKoreanRegionLabel(
  address: Record<string, string | undefined>
): string | null {
  const province =
    address.state?.trim() ||
    address.province?.trim() ||
    address.region?.trim() ||
    "";
  const city =
    address.city?.trim() ||
    address.county?.trim() ||
    address.town?.trim() ||
    "";
  const district =
    address.borough?.trim() ||
    address.city_district?.trim() ||
    address.municipality?.trim() ||
    address.suburb?.trim() ||
    "";

  const parts: string[] = [];
  if (province) parts.push(province);
  if (city && city !== province) parts.push(city);
  // 구 단위까지만. 동이 suburb로 오면 city와 다를 때만 제한적으로 허용
  if (district && district !== city && /구$|군$/.test(district)) {
    parts.push(district);
  }

  const label = parts.join(" ").trim();
  return label || null;
}
