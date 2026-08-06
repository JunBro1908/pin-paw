import type { ClusterPoint, MapItem, MapSourceType } from "../types/naver";

/** Deep-link focus zoom — close enough to show a precise pin. */
export const DEEP_LINK_FOCUS_ZOOM = 16;

export type DeepLinkCoordinate = { lat: number; lng: number };

export type SightingDetailPayload = {
  id?: unknown;
  lat?: unknown;
  lng?: unknown;
  source_type?: unknown;
  photo_keys?: unknown;
  occurred_at?: unknown;
  author_type?: unknown;
  trait_color?: unknown;
  trait_size?: unknown;
  trait_species?: unknown;
  note?: unknown;
};

function asFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function isValidCoordinate(
  coordinate: DeepLinkCoordinate
): coordinate is DeepLinkCoordinate {
  return Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng);
}

export function buildRecommendationMapHref(
  sightingId: string,
  lostPostId?: string
): string {
  const params = new URLSearchParams({ sightingId });
  if (lostPostId) params.set("lostPostId", lostPostId);
  return `/map?${params.toString()}`;
}

function toMapSourceType(value: unknown): MapSourceType {
  return value === "shelter" ? "shelter" : "sighting";
}

/**
 * Prefer precise coords from auth detail RPC; fall back to URL (often approximate
 * recommendation grid). Returns null when neither source is usable.
 */
export function resolveDeepLinkCenter(
  detail: SightingDetailPayload | null | undefined,
  urlCenter?: DeepLinkCoordinate | null
): DeepLinkCoordinate | null {
  const detailLat = asFiniteNumber(detail?.lat);
  const detailLng = asFiniteNumber(detail?.lng);
  if (detailLat != null && detailLng != null) {
    const precise = { lat: detailLat, lng: detailLng };
    if (isValidCoordinate(precise)) return precise;
  }
  if (urlCenter && isValidCoordinate(urlCenter)) return urlCenter;
  return null;
}

/** Build a point MapItem for the detail sheet from GET /api/v1/auth/sightings/:id. */
export function buildFocusedSightingFromDetail(
  detail: SightingDetailPayload,
  center: DeepLinkCoordinate
): ClusterPoint | null {
  const id = typeof detail.id === "string" ? detail.id.trim() : "";
  if (!id || !isValidCoordinate(center)) return null;

  return {
    id,
    lat: center.lat,
    lng: center.lng,
    type: "point",
    source_type: toMapSourceType(detail.source_type),
    photo_keys: Array.isArray(detail.photo_keys)
      ? (detail.photo_keys.filter((key) => typeof key === "string") as string[])
      : undefined,
    occurred_at:
      typeof detail.occurred_at === "string" ? detail.occurred_at : undefined,
    author_type:
      detail.author_type === "anon" || detail.author_type === "user"
        ? detail.author_type
        : undefined,
    trait_color:
      typeof detail.trait_color === "string" ? detail.trait_color : undefined,
    trait_size:
      typeof detail.trait_size === "string" ? detail.trait_size : undefined,
    trait_species:
      typeof detail.trait_species === "string"
        ? detail.trait_species
        : undefined,
    note: typeof detail.note === "string" ? detail.note : undefined,
  };
}

/** Find a loaded viewport point matching the deep-link sightingId. */
export function findFocusedPointInItems(
  items: readonly MapItem[],
  sightingId: string
): (MapItem & { type: "point"; id: string }) | null {
  const wantId = normalizeId(sightingId);
  const point = items.find(
    (item): item is MapItem & { type: "point"; id: string } =>
      item.type === "point" &&
      "id" in item &&
      typeof item.id === "string" &&
      normalizeId(item.id) === wantId
  );
  return point ?? null;
}
