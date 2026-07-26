const SEARCH_QUERY_MAX_LENGTH = 80;
const MAP_MAX_SPAN_DEGREES = 2;

export type SearchQueryResult =
  | { ok: true; query: string }
  | {
      ok: false;
      reason: "query_missing" | "query_too_long" | "query_invalid";
    };

export function normalizeSearchQuery(value: string | null): SearchQueryResult {
  const query = value?.trim() ?? "";
  if (!query) return { ok: false, reason: "query_missing" };
  if ([...query].length > SEARCH_QUERY_MAX_LENGTH) {
    return { ok: false, reason: "query_too_long" };
  }
  if (/[\u0000-\u001f\u007f]/.test(query)) {
    return { ok: false, reason: "query_invalid" };
  }
  return { ok: true, query };
}

interface MapViewport {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
  zoom: number;
}

export type MapViewportResult =
  | { ok: true }
  | {
      ok: false;
      reason: "invalid_coordinates" | "invalid_zoom" | "bbox_too_large";
    };

type MapViewportQuery = {
  minLat: string | null;
  minLng: string | null;
  maxLat: string | null;
  maxLng: string | null;
  zoom: string | null;
};

export type ParsedMapViewportResult =
  | { ok: true; viewport: MapViewport }
  | Exclude<MapViewportResult, { ok: true }>;

function strictCoordinate(value: string | null): number | undefined {
  if (value === null || !/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value)) {
    return undefined;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

export function parseMapViewportQuery(
  query: MapViewportQuery
): ParsedMapViewportResult {
  const minLat = strictCoordinate(query.minLat);
  const minLng = strictCoordinate(query.minLng);
  const maxLat = strictCoordinate(query.maxLat);
  const maxLng = strictCoordinate(query.maxLng);
  const zoom =
    query.zoom !== null && /^(?:0|[1-9]\d*)$/.test(query.zoom)
      ? Number(query.zoom)
      : undefined;
  if (
    minLat === undefined ||
    minLng === undefined ||
    maxLat === undefined ||
    maxLng === undefined ||
    zoom === undefined ||
    !Number.isSafeInteger(zoom)
  ) {
    return { ok: false, reason: "invalid_coordinates" };
  }
  const viewport = { minLat, minLng, maxLat, maxLng, zoom };
  const validation = validateMapViewport(viewport);
  return validation.ok ? { ok: true, viewport } : validation;
}

export function validateMapViewport(viewport: MapViewport): MapViewportResult {
  const { minLat, minLng, maxLat, maxLng, zoom } = viewport;
  if (
    ![minLat, minLng, maxLat, maxLng].every(Number.isFinite) ||
    minLat < -90 ||
    maxLat > 90 ||
    minLng < -180 ||
    maxLng > 180 ||
    minLat > maxLat ||
    minLng > maxLng
  ) {
    return { ok: false, reason: "invalid_coordinates" };
  }
  if (!Number.isInteger(zoom) || zoom < 1 || zoom > 21) {
    return { ok: false, reason: "invalid_zoom" };
  }
  if (
    maxLat - minLat > MAP_MAX_SPAN_DEGREES ||
    maxLng - minLng > MAP_MAX_SPAN_DEGREES
  ) {
    return { ok: false, reason: "bbox_too_large" };
  }
  return { ok: true };
}
