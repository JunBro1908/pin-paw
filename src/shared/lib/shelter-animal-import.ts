export type SizeValue = "small" | "medium" | "large" | "unknown";

export interface ShelterAnimalRecord {
  desertionNo: string;
  happenDt: string;
  happenPlace: string;
  kindCd: string;
  colorCd: string;
  weight: string;
  specialMark: string;
  processState: string;
  careNm: string;
  careAddr: string;
  orgNm: string;
  noticeNo: string;
  popfile: string;
  sexCd: string;
  neuterYn: string;
}

export type ShelterLocationSource = "happen_place" | "care_addr";

export function isShelterProcessActive(processState: string): boolean {
  return /보호|공고/.test(processState);
}

export function parseHappenDate(
  happenDt: string,
  now = new Date()
): Date | null {
  const raw = happenDt.trim();
  if (!/^\d{8}$/.test(raw)) return null;
  const year = Number(raw.slice(0, 4));
  const month = Number(raw.slice(4, 6));
  const day = Number(raw.slice(6, 8));
  const date = new Date(Date.UTC(year, month - 1, day, 3, 0, 0));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  if (date.getTime() > now.getTime() + 24 * 60 * 60 * 1000) return null;
  return date;
}

export function parseWeightKg(weight: string): number | null {
  const match = weight
    .replace(/,/g, "")
    .match(/(\d+(?:\.\d+)?)\s*(?:kg|Kg|KG)?/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function sizeFromWeightKg(weightKg: number | null): SizeValue {
  if (weightKg == null) return "unknown";
  if (weightKg < 5) return "small";
  if (weightKg < 15) return "medium";
  return "large";
}

export function speciesFromKindCd(kindCd: string): string | null {
  const cleaned = kindCd
    .replace(/^\[[^\]]+\]\s*/, "")
    .replace(/\s+/g, " ")
    .trim();
  return cleaned || null;
}

export function buildGeocodeQueries(record: ShelterAnimalRecord): Array<{
  query: string;
  source: ShelterLocationSource;
}> {
  const queries: Array<{ query: string; source: ShelterLocationSource }> = [];
  const happen = record.happenPlace.trim();
  const org = record.orgNm.trim();
  if (happen) {
    queries.push({
      query: org ? `${org} ${happen}` : happen,
      source: "happen_place",
    });
  }
  const care = record.careAddr.trim();
  if (care) {
    queries.push({ query: care, source: "care_addr" });
  }
  return queries;
}

export function buildShelterSightingNote(record: ShelterAnimalRecord): string {
  const lines = [
    "[공공데이터·구조동물]",
    `유기번호 ${record.desertionNo}`,
    record.noticeNo ? `공고번호 ${record.noticeNo}` : null,
    record.happenPlace ? `발견장소 ${record.happenPlace}` : null,
    record.careNm ? `보호소 ${record.careNm}` : null,
    record.specialMark ? `특징 ${record.specialMark}` : null,
    record.processState ? `상태 ${record.processState}` : null,
    "출처: 농림축산검역본부 국가동물보호정보시스템",
  ];
  return lines.filter(Boolean).join("\n").slice(0, 1000);
}

export function mapShelterTraits(record: ShelterAnimalRecord): {
  traitColor: string | null;
  traitSize: SizeValue;
  traitSpecies: string | null;
} {
  const traitColor = record.colorCd.trim() || null;
  const weightKg = parseWeightKg(record.weight);
  return {
    traitColor,
    traitSize: sizeFromWeightKg(weightKg),
    traitSpecies: speciesFromKindCd(record.kindCd),
  };
}

export function ymdDaysAgo(days: number, now = new Date()): string {
  const d = new Date(now);
  d.setUTCDate(d.getUTCDate() - days);
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

export function ymdToday(now = new Date()): string {
  return ymdDaysAgo(0, now);
}

export function normalizeShelterAnimalItem(
  raw: Record<string, unknown>
): ShelterAnimalRecord | null {
  const desertionNo = String(raw.desertionNo ?? raw.desertion_no ?? "").trim();
  if (!desertionNo) return null;
  return {
    desertionNo,
    happenDt: String(raw.happenDt ?? raw.happen_dt ?? "").trim(),
    happenPlace: String(raw.happenPlace ?? raw.happen_place ?? "").trim(),
    kindCd: String(raw.kindCd ?? raw.kind_cd ?? "").trim(),
    colorCd: String(raw.colorCd ?? raw.color_cd ?? "").trim(),
    weight: String(raw.weight ?? "").trim(),
    specialMark: String(raw.specialMark ?? raw.special_mark ?? "").trim(),
    processState: String(raw.processState ?? raw.process_state ?? "").trim(),
    careNm: String(raw.careNm ?? raw.care_nm ?? "").trim(),
    careAddr: String(raw.careAddr ?? raw.care_addr ?? "").trim(),
    orgNm: String(raw.orgNm ?? raw.org_nm ?? "").trim(),
    noticeNo: String(raw.noticeNo ?? raw.notice_no ?? "").trim(),
    popfile: String(raw.popfile ?? "").trim(),
    sexCd: String(raw.sexCd ?? raw.sex_cd ?? "").trim(),
    neuterYn: String(raw.neuterYn ?? raw.neuter_yn ?? "").trim(),
  };
}

/**
 * Naver Local Search (developers.naver.com 검색 API).
 * 2023-08 이후 mapx/mapy는 WGS84 * 1e7 정수입니다.
 */

export interface NaverLocalSearchItem {
  title: string;
  address: string;
  roadAddress: string;
  mapx: number;
  mapy: number;
}

export interface GeocodedPlace {
  lat: number;
  lng: number;
  label: string;
}

export function parseNaverLocalCoordinates(
  mapx: number,
  mapy: number
): { lat: number; lng: number } | null {
  if (!Number.isFinite(mapx) || !Number.isFinite(mapy)) return null;

  // Post-2023 Local Search: integer microdegrees (Seoul City Hall ≈ 1269873882, 375666103).
  if (Math.abs(mapx) > 1_000_000 && Math.abs(mapy) > 1_000_000) {
    const lng = mapx / 1e7;
    const lat = mapy / 1e7;
    if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
    return { lat, lng };
  }

  return null;
}

export function pickFirstGeocodedPlace(
  items: NaverLocalSearchItem[]
): GeocodedPlace | null {
  for (const item of items) {
    const coords = parseNaverLocalCoordinates(item.mapx, item.mapy);
    if (!coords) continue;
    const sub =
      item.roadAddress || item.address
        ? ` · ${item.roadAddress || item.address}`
        : "";
    return {
      lat: coords.lat,
      lng: coords.lng,
      label: `${item.title ?? ""}${sub}`.trim() || "geocoded",
    };
  }
  return null;
}

export async function fetchNaverLocalSearch(
  query: string,
  env: {
    clientId: string | undefined;
    clientSecret: string | undefined;
  },
  fetchImpl: typeof fetch = fetch
): Promise<
  | { ok: true; items: NaverLocalSearchItem[] }
  | { ok: false; reason: "not_configured" | "upstream_error" | "timeout" }
> {
  const clientId = env.clientId?.trim();
  const clientSecret = env.clientSecret?.trim();
  if (!clientId || !clientSecret) {
    return { ok: false, reason: "not_configured" };
  }

  const trimmed = query.trim();
  if (trimmed.length < 2) {
    return { ok: true, items: [] };
  }

  const url = new URL("https://openapi.naver.com/v1/search/local.json");
  url.searchParams.set("query", trimmed);
  url.searchParams.set("display", "5");
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", "random");

  try {
    const res = await fetchImpl(url.toString(), {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret,
      },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      return { ok: false, reason: "upstream_error" };
    }
    const data = (await res.json()) as {
      items?: Array<{
        title?: string;
        address?: string;
        roadAddress?: string;
        mapx?: string | number;
        mapy?: string | number;
      }>;
    };
    const items = (data.items ?? []).map((item) => ({
      title: (item.title ?? "").replace(/<[^>]+>/g, ""),
      address: item.address ?? "",
      roadAddress: item.roadAddress ?? "",
      mapx: parseInt(String(item.mapx ?? 0), 10) || 0,
      mapy: parseInt(String(item.mapy ?? 0), 10) || 0,
    }));
    return { ok: true, items };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, reason: timedOut ? "timeout" : "upstream_error" };
  }
}

function isJpeg(bytes: Uint8Array): boolean {
  return (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  );
}

function isPng(bytes: Uint8Array): boolean {
  const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
  return (
    bytes.length >= signature.length &&
    signature.every((value, index) => bytes[index] === value)
  );
}

const ABANDONMENT_URL =
  "https://apis.data.go.kr/1543061/abandonmentPublicService_v2/abandonmentPublic_v2";

/** 개(upkind) */
export const SHELTER_UPKIND_DOG = "417000";

export interface ShelterImportDeps {
  serviceKey: string | undefined;
  naverClientId: string | undefined;
  naverClientSecret: string | undefined;
  fetchImpl?: typeof fetch;
  listExistingDesertionNos: (
    desertionNos: string[]
  ) => Promise<{ ok: true; ids: Set<string> } | { ok: false }>;
  uploadSightingPhoto: (input: {
    objectKey: string;
    bytes: Uint8Array;
    contentType: "image/jpeg" | "image/png";
  }) => Promise<{ ok: true } | { ok: false }>;
  importSighting: (input: {
    desertionNo: string;
    photoKeys: string[];
    occurredAt: string;
    lat: number;
    lng: number;
    traitColor: string | null;
    traitSize: string;
    traitSpecies: string | null;
    colorTokens: string[];
    note: string;
    processState: string;
    locationSource: ShelterLocationSource;
    geocodeQuery: string;
    photoSourceUrl: string | null;
  }) => Promise<{ ok: true; sightingId: string } | { ok: false }>;
  syncExisting: (input: {
    desertionNo: string;
    processState: string;
  }) => Promise<{ ok: true } | { ok: false }>;
  createObjectKey: (ext: "jpg" | "png") => string;
  extractColorTokens: (text: string | null) => string[];
  now?: Date;
  lookbackDays?: number;
  maxNewImports?: number;
  pageSize?: number;
  upkind?: string;
}

export interface ShelterImportSummary {
  fetched: number;
  created: number;
  synced: number;
  skippedGeocode: number;
  skippedPhoto: number;
  skippedInactiveNew: number;
  failed: number;
  pages: number;
}

type AbandonmentBody = {
  response?: {
    body?: {
      items?: { item?: unknown } | unknown[];
      totalCount?: number | string;
      numOfRows?: number | string;
      pageNo?: number | string;
    };
    header?: { resultCode?: string; resultMsg?: string };
  };
};

function asItemArray(items: unknown): Record<string, unknown>[] {
  if (items == null) return [];
  if (Array.isArray(items)) {
    return items.filter(
      (row): row is Record<string, unknown> =>
        row !== null && typeof row === "object" && !Array.isArray(row)
    );
  }
  if (typeof items === "object" && items !== null && "item" in items) {
    return asItemArray((items as { item: unknown }).item);
  }
  if (typeof items === "object" && !Array.isArray(items)) {
    return [items as Record<string, unknown>];
  }
  return [];
}

export async function fetchAbandonmentPage(input: {
  serviceKey: string;
  pageNo: number;
  numOfRows: number;
  bgnde: string;
  endde: string;
  upkind: string;
  fetchImpl?: typeof fetch;
}): Promise<
  | { ok: true; records: ShelterAnimalRecord[]; totalCount: number }
  | { ok: false; reason: "upstream_error" | "timeout" | "decode_error" }
> {
  const url = new URL(ABANDONMENT_URL);
  // data.go.kr keys are often already URL-encoded; avoid double-encoding.
  let serviceKey = input.serviceKey;
  try {
    serviceKey = decodeURIComponent(input.serviceKey);
  } catch {
    serviceKey = input.serviceKey;
  }
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("_type", "json");
  url.searchParams.set("pageNo", String(input.pageNo));
  url.searchParams.set("numOfRows", String(input.numOfRows));
  url.searchParams.set("bgnde", input.bgnde);
  url.searchParams.set("endde", input.endde);
  url.searchParams.set("upkind", input.upkind);

  try {
    const res = await (input.fetchImpl ?? fetch)(url.toString(), {
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) return { ok: false, reason: "upstream_error" };
    const body = (await res.json()) as AbandonmentBody;
    const code = body.response?.header?.resultCode;
    if (code && code !== "00" && code !== "NORMAL_CODE") {
      return { ok: false, reason: "upstream_error" };
    }
    const rawItems = body.response?.body?.items;
    const rows = asItemArray(rawItems);
    const records = rows
      .map(normalizeShelterAnimalItem)
      .filter((row): row is ShelterAnimalRecord => row != null);
    const totalCount = Number(
      body.response?.body?.totalCount ?? records.length
    );
    return {
      ok: true,
      records,
      totalCount: Number.isFinite(totalCount) ? totalCount : records.length,
    };
  } catch (error) {
    const timedOut =
      error instanceof Error &&
      (error.name === "TimeoutError" || error.name === "AbortError");
    return { ok: false, reason: timedOut ? "timeout" : "decode_error" };
  }
}

async function geocodeRecord(
  record: ShelterAnimalRecord,
  env: { clientId: string | undefined; clientSecret: string | undefined },
  fetchImpl: typeof fetch
): Promise<
  | {
      ok: true;
      lat: number;
      lng: number;
      source: ShelterLocationSource;
      query: string;
    }
  | { ok: false }
> {
  for (const candidate of buildGeocodeQueries(record)) {
    const result = await fetchNaverLocalSearch(candidate.query, env, fetchImpl);
    if (!result.ok) continue;
    const place = pickFirstGeocodedPlace(result.items);
    if (!place) continue;
    return {
      ok: true,
      lat: place.lat,
      lng: place.lng,
      source: candidate.source,
      query: candidate.query,
    };
  }
  return { ok: false };
}

async function downloadPhoto(
  photoUrl: string,
  fetchImpl: typeof fetch
): Promise<
  | {
      ok: true;
      bytes: Uint8Array;
      contentType: "image/jpeg" | "image/png";
      ext: "jpg" | "png";
    }
  | { ok: false }
> {
  if (!photoUrl.startsWith("http://") && !photoUrl.startsWith("https://")) {
    return { ok: false };
  }
  try {
    const res = await fetchImpl(photoUrl, {
      signal: AbortSignal.timeout(15000),
      redirect: "follow",
    });
    if (!res.ok) return { ok: false };
    const buffer = new Uint8Array(await res.arrayBuffer());
    if (buffer.byteLength < 32 || buffer.byteLength > 10 * 1024 * 1024) {
      return { ok: false };
    }
    if (isJpeg(buffer)) {
      return {
        ok: true,
        bytes: buffer,
        contentType: "image/jpeg",
        ext: "jpg",
      };
    }
    if (isPng(buffer)) {
      return {
        ok: true,
        bytes: buffer,
        contentType: "image/png",
        ext: "png",
      };
    }
    return { ok: false };
  } catch {
    return { ok: false };
  }
}

export async function runShelterAnimalImport(deps: ShelterImportDeps): Promise<
  | { ok: true; summary: ShelterImportSummary }
  | {
      ok: false;
      reason: "not_configured" | "fetch_failed";
      summary: ShelterImportSummary;
    }
> {
  const summary: ShelterImportSummary = {
    fetched: 0,
    created: 0,
    synced: 0,
    skippedGeocode: 0,
    skippedPhoto: 0,
    skippedInactiveNew: 0,
    failed: 0,
    pages: 0,
  };

  const serviceKey = deps.serviceKey?.trim();
  if (!serviceKey) {
    return { ok: false, reason: "not_configured", summary };
  }
  if (!deps.naverClientId?.trim() || !deps.naverClientSecret?.trim()) {
    return { ok: false, reason: "not_configured", summary };
  }

  const now = deps.now ?? new Date();
  const lookbackDays = deps.lookbackDays ?? 7;
  const maxNewImports = deps.maxNewImports ?? 40;
  const pageSize = Math.min(deps.pageSize ?? 100, 1000);
  const upkind = deps.upkind ?? SHELTER_UPKIND_DOG;
  const fetchImpl = deps.fetchImpl ?? fetch;
  const bgnde = ymdDaysAgo(lookbackDays, now);
  const endde = ymdToday(now);

  let pageNo = 1;
  let totalCount = Number.POSITIVE_INFINITY;

  while (summary.fetched < totalCount && summary.created < maxNewImports) {
    const page = await fetchAbandonmentPage({
      serviceKey,
      pageNo,
      numOfRows: pageSize,
      bgnde,
      endde,
      upkind,
      fetchImpl,
    });
    if (!page.ok) {
      return { ok: false, reason: "fetch_failed", summary };
    }
    summary.pages += 1;
    totalCount = page.totalCount;
    if (page.records.length === 0) break;

    summary.fetched += page.records.length;
    const desertionNos = page.records.map((r) => r.desertionNo);
    const existingResult = await deps.listExistingDesertionNos(desertionNos);
    if (!existingResult.ok) {
      return { ok: false, reason: "fetch_failed", summary };
    }
    const existing = existingResult.ids;

    for (const record of page.records) {
      if (existing.has(record.desertionNo)) {
        const synced = await deps.syncExisting({
          desertionNo: record.desertionNo,
          processState: record.processState || "unknown",
        });
        if (synced.ok) summary.synced += 1;
        else summary.failed += 1;
        continue;
      }

      if (!isShelterProcessActive(record.processState || "")) {
        summary.skippedInactiveNew += 1;
        continue;
      }

      if (summary.created >= maxNewImports) break;

      const occurred = parseHappenDate(record.happenDt, now);
      if (!occurred) {
        summary.failed += 1;
        continue;
      }

      const geo = await geocodeRecord(
        record,
        {
          clientId: deps.naverClientId,
          clientSecret: deps.naverClientSecret,
        },
        fetchImpl
      );
      if (!geo.ok) {
        summary.skippedGeocode += 1;
        continue;
      }

      const photoUrl = record.popfile;
      const photo = await downloadPhoto(photoUrl, fetchImpl);
      if (!photo.ok) {
        summary.skippedPhoto += 1;
        continue;
      }

      const objectKey = deps.createObjectKey(photo.ext);
      const uploaded = await deps.uploadSightingPhoto({
        objectKey,
        bytes: photo.bytes,
        contentType: photo.contentType,
      });
      if (!uploaded.ok) {
        summary.failed += 1;
        continue;
      }

      const traits = mapShelterTraits(record);
      const imported = await deps.importSighting({
        desertionNo: record.desertionNo,
        photoKeys: [objectKey],
        occurredAt: occurred.toISOString(),
        lat: geo.lat,
        lng: geo.lng,
        traitColor: traits.traitColor,
        traitSize: traits.traitSize,
        traitSpecies: traits.traitSpecies,
        colorTokens: deps.extractColorTokens(traits.traitColor),
        note: buildShelterSightingNote(record),
        processState: record.processState || "unknown",
        locationSource: geo.source,
        geocodeQuery: geo.query,
        photoSourceUrl: photoUrl || null,
      });
      if (imported.ok) summary.created += 1;
      else summary.failed += 1;
    }

    if (page.records.length < pageSize) break;
    pageNo += 1;
    if (pageNo > 50) break;
  }

  return { ok: true, summary };
}
