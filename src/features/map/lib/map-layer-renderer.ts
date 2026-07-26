import type { BookmarkPath, Coordinate } from "./map-domain";
import type { LostPostMapItem } from "./map-data-state";
import type { NaverMapAdapter } from "./naver-map-adapter";
import type {
  MapItem,
  NaverLatLng,
  NaverMapInstance,
  NaverMarkerInstance,
  NaverPoint,
  NaverPolylineInstance,
} from "../types/naver";

const PATH_DURATION_MS = 1800;
const PATH_REPLAY_PAUSE_MS = 1000;

export interface AnimationScheduler {
  now(): number;
  requestFrame(callback: () => void): number;
  cancelFrame(id: number): void;
  setDelay(callback: () => void, milliseconds: number): number;
  clearDelay(id: number): void;
}

interface MapLayerRendererDependencies {
  adapter: Pick<
    NaverMapAdapter,
    | "createMarker"
    | "createPolyline"
    | "listen"
    | "replaceMarkers"
    | "replacePolylines"
  >;
  scheduler: AnimationScheduler;
  toLatLng(coordinate: Coordinate): NaverLatLng;
  toPoint(x: number, y: number): NaverPoint;
  normalizeId(id: string): string;
  getPathCoordinates(path: BookmarkPath): Coordinate[];
  interpolatePath(coordinates: Coordinate[], progress: number): Coordinate[];
}

interface RenderSightingsInput {
  map: NaverMapInstance;
  items: MapItem[];
  feedback: Record<string, { seen: boolean; claimed: boolean }>;
  getImageUrl(key: string): string;
  onItemClick(item: MapItem, marker: NaverMarkerInstance): void;
}

interface RenderBookmarkSightingsInput {
  map: NaverMapInstance;
  paths: BookmarkPath[];
  getImageUrl(key: string): string;
  onSightingClick(item: MapItem, marker: NaverMarkerInstance): void;
}

interface RenderLostPostsInput {
  map: NaverMapInstance;
  lostPosts: LostPostMapItem[];
  getImageUrl(key: string): string;
  onLostPostClick(lostPost: LostPostMapItem, marker: NaverMarkerInstance): void;
}

interface RenderPathsInput {
  map: NaverMapInstance;
  paths: BookmarkPath[];
  enabled: boolean;
}

export interface MapLayerRenderer {
  renderSightings(input: RenderSightingsInput): void;
  renderBookmarkSightings(input: RenderBookmarkSightingsInput): void;
  renderLostPosts(input: RenderLostPostsInput): void;
  renderPaths(input: RenderPathsInput): void;
  clearMarkers(): void;
  clearPaths(): void;
  dispose(): void;
}

export function createBrowserAnimationScheduler(): AnimationScheduler {
  return {
    now: () => performance.now(),
    requestFrame: (callback) => requestAnimationFrame(callback),
    cancelFrame: (id) => cancelAnimationFrame(id),
    setDelay: (callback, milliseconds) =>
      window.setTimeout(callback, milliseconds),
    clearDelay: (id) => window.clearTimeout(id),
  };
}

export function createMapLayerRenderer({
  adapter,
  scheduler,
  toLatLng,
  toPoint,
  normalizeId,
  getPathCoordinates,
  interpolatePath,
}: MapLayerRendererDependencies): MapLayerRenderer {
  let staticPolylines: NaverPolylineInstance[] = [];
  let animationPolylines: NaverPolylineInstance[] = [];
  let animationCoordinates: Coordinate[][] = [];
  let frameId: number | null = null;
  let delayId: number | null = null;
  let animationStartedAt = 0;

  const createSightingContent = (
    item: MapItem,
    feedback: Record<string, { seen: boolean; claimed: boolean }>,
    getImageUrl: (key: string) => string
  ) => {
    if (item.type === "cluster") {
      const size = 32 + Math.min(item.count * 1.5, 20);
      return `<div style="
        width: ${size}px;
        height: ${size}px;
        background: #00C73C;
        border: 2px solid white;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        color: white;
        font-weight: 700;
        font-size: 14px;
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        cursor: pointer;
        transition: all 0.2s ease-out;
      " onmouseover="this.style.transform='scale(1.05)'; this.style.backgroundColor='#00B336'"
         onmouseout="this.style.transform='scale(1)'; this.style.backgroundColor='#00C73C'">${item.count}</div>`;
    }

    const itemFeedback = feedback[normalizeId(item.id)];
    const borderColor = itemFeedback?.claimed
      ? "#22c55e"
      : itemFeedback?.seen
        ? "#6b7280"
        : "#FF4D4D";
    const thumbnailUrl = item.photo_keys?.[0]
      ? getImageUrl(item.photo_keys[0])
      : "/icons/marker.png";

    return `<div style="cursor: pointer; position: relative; display: flex; flex-direction: column; align-items: center; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">
      <div style="
        width: 44px;
        height: 44px;
        background: white;
        border: 2.5px solid ${borderColor};
        border-radius: 50% 50% 50% 0;
        transform: rotate(-45deg);
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
      ">
        <div style="
          width: 34px;
          height: 34px;
          border-radius: 50%;
          background-image: url('${thumbnailUrl}');
          background-size: cover;
          background-position: center;
          transform: rotate(45deg);
          border: 1px solid rgba(0,0,0,0.1);
        "></div>
      </div>
      <div style="width: 2px; height: 6px; background: ${borderColor}; margin-top: -2px;"></div>
    </div>`;
  };

  const createLostPostContent = (thumbnailUrl: string) =>
    `<div style="cursor: pointer; filter: drop-shadow(0 4px 8px rgba(0,0,0,0.3));">
      <div style="
        width: 44px;
        height: 44px;
        background: white;
        border: 2.5px solid #f59e0b;
        border-radius: 12px;
        display: flex;
        align-items: center;
        justify-content: center;
        overflow: hidden;
        box-sizing: border-box;
      ">
        <div style="
          width: 36px;
          height: 36px;
          border-radius: 8px;
          background-image: url('${thumbnailUrl}');
          background-size: cover;
          background-position: center;
          border: 1px solid rgba(0,0,0,0.08);
        "></div>
      </div>
    </div>`;

  const clearScheduledWork = () => {
    if (frameId !== null) {
      scheduler.cancelFrame(frameId);
      frameId = null;
    }
    if (delayId !== null) {
      scheduler.clearDelay(delayId);
      delayId = null;
    }
  };

  const clearMarkers = () => {
    adapter.replaceMarkers([], "sightings");
    adapter.replaceMarkers([], "lost-posts");
  };

  const clearPaths = () => {
    clearScheduledWork();
    adapter.replacePolylines([], "paths");
    adapter.replacePolylines([], "path-animation");
    staticPolylines = [];
    animationPolylines = [];
    animationCoordinates = [];
  };

  const renderSightings = ({
    map,
    items,
    feedback,
    getImageUrl,
    onItemClick,
  }: RenderSightingsInput) => {
    const markers = items.map((item) => {
      const marker = adapter.createMarker({
        position: toLatLng(item),
        map,
        icon: {
          content: createSightingContent(item, feedback, getImageUrl),
          anchor: toPoint(22, 50),
        },
        title: item.type === "point" ? item.note : `클러스터 (${item.count})`,
      });
      adapter.listen(marker, "click", () => onItemClick(item, marker));
      return marker;
    });
    adapter.replaceMarkers(markers, "sightings");
  };

  const renderBookmarkSightings = ({
    map,
    paths,
    getImageUrl,
    onSightingClick,
  }: RenderBookmarkSightingsInput) => {
    const items: MapItem[] = paths.flatMap((path) =>
      path.points
        .filter(
          (point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)
        )
        .map((point) => ({
          type: "point" as const,
          id: point.sighting_id,
          lat: point.lat,
          lng: point.lng,
          note: point.note ?? undefined,
          photo_keys: Array.isArray(point.photo_keys)
            ? point.photo_keys
            : undefined,
          occurred_at: point.occurred_at,
        }))
    );
    const feedback = Object.fromEntries(
      items
        .filter((item) => item.type === "point")
        .map((item) => [normalizeId(item.id), { seen: false, claimed: true }])
    );
    const markers = items.map((item) => {
      const marker = adapter.createMarker({
        position: toLatLng(item),
        map,
        icon: {
          content: createSightingContent(item, feedback, getImageUrl),
          anchor: toPoint(22, 50),
        },
        title: item.type === "point" ? item.note : "제보",
      });
      adapter.listen(marker, "click", () => onSightingClick(item, marker));
      return marker;
    });
    adapter.replaceMarkers(markers, "sightings");
  };

  const renderLostPosts = ({
    map,
    lostPosts,
    getImageUrl,
    onLostPostClick,
  }: RenderLostPostsInput) => {
    const markers = lostPosts
      .filter(
        (lostPost) =>
          Number.isFinite(lostPost.lat) && Number.isFinite(lostPost.lng)
      )
      .map((lostPost) => {
        const thumbnailUrl = lostPost.cover_photo_key
          ? getImageUrl(lostPost.cover_photo_key)
          : "/icons/marker.png";
        const marker = adapter.createMarker({
          position: toLatLng(lostPost),
          map,
          icon: {
            content: createLostPostContent(thumbnailUrl),
            anchor: toPoint(22, 44),
          },
          title: lostPost.pet_name?.trim() || "유실 장소",
        });
        adapter.listen(marker, "click", () =>
          onLostPostClick(lostPost, marker)
        );
        return marker;
      });
    adapter.replaceMarkers(markers, "lost-posts");
  };

  const renderPaths = ({ map, paths, enabled }: RenderPathsInput) => {
    clearPaths();
    if (!enabled) return;

    animationCoordinates = paths
      .map(getPathCoordinates)
      .filter((coordinates) => coordinates.length >= 2);
    if (animationCoordinates.length === 0) return;

    staticPolylines = animationCoordinates.map((coordinates) =>
      adapter.createPolyline({
        map,
        path: coordinates.map(toLatLng),
        strokeColor: "#86efac",
        strokeWeight: 4,
        zIndex: 0,
      })
    );
    animationPolylines = animationCoordinates.map((coordinates) =>
      adapter.createPolyline({
        map,
        path: [toLatLng(coordinates[0])],
        strokeColor: "#22c55e",
        strokeWeight: 5,
        zIndex: 1,
      })
    );
    adapter.replacePolylines(staticPolylines, "paths");
    adapter.replacePolylines(animationPolylines, "path-animation");

    const resetAnimationPaths = () => {
      animationPolylines.forEach((polyline, index) => {
        const first = animationCoordinates[index]?.[0];
        if (first) polyline.setPath([toLatLng(first)]);
      });
    };

    const tick = () => {
      const progress = Math.min(
        (scheduler.now() - animationStartedAt) / PATH_DURATION_MS,
        1
      );
      animationPolylines.forEach((polyline, index) => {
        const coordinates = animationCoordinates[index];
        polyline.setPath(interpolatePath(coordinates, progress).map(toLatLng));
      });

      if (progress < 1) {
        frameId = scheduler.requestFrame(tick);
        return;
      }

      frameId = null;
      resetAnimationPaths();
      delayId = scheduler.setDelay(() => {
        delayId = null;
        animationStartedAt = scheduler.now();
        frameId = scheduler.requestFrame(tick);
      }, PATH_REPLAY_PAUSE_MS);
    };

    animationStartedAt = scheduler.now();
    frameId = scheduler.requestFrame(tick);
  };

  return {
    renderSightings,
    renderBookmarkSightings,
    renderLostPosts,
    renderPaths,
    clearMarkers,
    clearPaths,
    dispose() {
      clearMarkers();
      clearPaths();
    },
  };
}
