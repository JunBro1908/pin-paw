import type { MapItem, MapSourceType } from "../types/naver";

export type SightingFeedbackMap = Record<
  string,
  { seen: boolean; claimed: boolean }
>;

export type MapLayer = "default" | "unseen" | "bookmark";

export const MAP_LAYER_STORAGE_KEY = "pinpaw.mapLayer";

/** Default map center (Seoul City Hall) — shared by map init and auth warm prefetch. */
export const DEFAULT_MAP_CENTER = { lat: 37.5665, lng: 126.978 } as const;
export const DEFAULT_MAP_WARM_ZOOM = 13;
/** Half-span for warm bbox; full span stays well under the 2° public/auth guard. */
export const DEFAULT_MAP_WARM_HALF_SPAN = 0.06;

const MAP_LAYERS: readonly MapLayer[] = ["default", "unseen", "bookmark"];

export function isMapLayer(value: unknown): value is MapLayer {
  return (
    typeof value === "string" &&
    (MAP_LAYERS as readonly string[]).includes(value)
  );
}

/** Browser-only. Falls back to default when storage is missing or invalid. */
export function readStoredMapLayer(
  storage: Pick<Storage, "getItem"> | null | undefined = typeof window ===
  "undefined"
    ? null
    : window.localStorage
): MapLayer {
  if (!storage) return "default";
  try {
    const value = storage.getItem(MAP_LAYER_STORAGE_KEY);
    return isMapLayer(value) ? value : "default";
  } catch {
    return "default";
  }
}

export function writeStoredMapLayer(
  layer: MapLayer,
  storage: Pick<Storage, "setItem"> | null | undefined = typeof window ===
  "undefined"
    ? null
    : window.localStorage
): void {
  if (!storage || !isMapLayer(layer)) return;
  try {
    storage.setItem(MAP_LAYER_STORAGE_KEY, layer);
  } catch {
    // Ignore quota / private-mode failures; preference is best-effort.
  }
}

/**
 * Guests only see masked public clusters. Auth-only layers (unseen/bookmark)
 * must not stick via localStorage after logout, or the map renders empty.
 */
export function resolveMapLayerForSession(
  layer: MapLayer,
  authenticated: boolean
): MapLayer {
  return authenticated || layer === "default" ? layer : "default";
}

export interface Coordinate {
  lat: number;
  lng: number;
}

export interface MapViewport {
  minLat: number;
  minLng: number;
  maxLat: number;
  maxLng: number;
}

export interface BookmarkPath {
  lost_post_id: string;
  lost_lat: number;
  lost_lng: number;
  lost_at: string;
  points: {
    sighting_id: string;
    source_type: MapSourceType;
    lat: number;
    lng: number;
    occurred_at: string;
    photo_keys?: string[] | null;
    note?: string | null;
  }[];
}

export function normalizeSightingId(id: string): string {
  return String(id).toLowerCase().trim();
}

export function getFilteredItems(
  rawItems: MapItem[],
  feedbackMap: SightingFeedbackMap,
  layer: MapLayer
): MapItem[] {
  if (layer === "default") return rawItems;

  return rawItems.filter((item) => {
    if (item.type !== "point") return false;

    const feedback = feedbackMap[normalizeSightingId(item.id)];
    if (layer === "unseen") return feedback ? !feedback.seen : true;
    return feedback?.claimed ?? false;
  });
}

/**
 * Cluster grid policy (auth ALL layer):
 * - zoom ≥15: near-individual pins (tiny grid); clusters rare.
 * - mid zoom: only ordinary sightings cluster; owner + claimed/bookmark
 *   endpoints stay as points (RPC), lost-post pins + trails render separately.
 * - low zoom: same privilege split; keep lost-post/trail overlays visible.
 * Guests stay on a coarser public grid (zoom capped at 14).
 */
export function getGridSize(zoom: number, authenticated: boolean): number {
  const effectiveZoom = authenticated ? zoom : Math.min(zoom, 14);

  if (effectiveZoom >= 15) return 0.001;
  if (effectiveZoom >= 14) return 0.006;
  if (effectiveZoom >= 13) return 0.03;
  if (effectiveZoom >= 11) return 0.05;
  if (effectiveZoom >= 9) return 0.1;
  return 0.5;
}

export function getRequestZoom(zoom: number, layer: MapLayer): number {
  return layer === "bookmark" ? Math.max(zoom, 17) : zoom;
}

export function buildMapCacheKey(
  viewport: MapViewport,
  zoom: number,
  authenticated: boolean,
  layer: MapLayer
): string {
  const requestZoom = getRequestZoom(zoom, layer);
  const gridSize = getGridSize(requestZoom, authenticated);
  const snap = (value: number) => Math.floor(value / gridSize);

  return `${authenticated}:${layer}:${snap(viewport.minLat)},${snap(
    viewport.minLng
  )},${snap(viewport.maxLat)},${snap(viewport.maxLng)},${requestZoom}`;
}

export function isValidCoordinate(
  coordinate: Coordinate
): coordinate is Coordinate {
  return Number.isFinite(coordinate.lat) && Number.isFinite(coordinate.lng);
}

export function getBookmarkPathCoordinates(path: BookmarkPath): Coordinate[] {
  const lost = { lat: path.lost_lat, lng: path.lost_lng };
  if (!isValidCoordinate(lost)) return [];

  return [
    lost,
    ...(path.points ?? [])
      .map(({ lat, lng }) => ({ lat, lng }))
      .filter(isValidCoordinate),
  ];
}

export function interpolatePath(
  coordinates: Coordinate[],
  progress: number
): Coordinate[] {
  if (coordinates.length === 0) return [];
  if (coordinates.length === 1 || progress <= 0) return [coordinates[0]];
  if (progress >= 1) return [...coordinates];

  const segmentLengths = coordinates
    .slice(0, -1)
    .map((coordinate, index) =>
      Math.hypot(
        coordinates[index + 1].lat - coordinate.lat,
        coordinates[index + 1].lng - coordinate.lng
      )
    );
  const totalDistance = segmentLengths.reduce(
    (total, length) => total + length,
    0
  );

  if (totalDistance === 0) return [coordinates[0]];

  const targetDistance = progress * totalDistance;
  let traversedDistance = 0;

  for (let index = 0; index < segmentLengths.length; index += 1) {
    const segmentLength = segmentLengths[index];
    if (segmentLength === 0) continue;

    if (traversedDistance + segmentLength >= targetDistance) {
      const fraction = (targetDistance - traversedDistance) / segmentLength;
      const start = coordinates[index];
      const end = coordinates[index + 1];

      return [
        ...coordinates.slice(0, index + 1),
        {
          lat: start.lat + fraction * (end.lat - start.lat),
          lng: start.lng + fraction * (end.lng - start.lng),
        },
      ];
    }

    traversedDistance += segmentLength;
  }

  return [...coordinates];
}
