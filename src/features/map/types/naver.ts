export interface NaverLatLng {
  lat(): number;
  lng(): number;
}

export interface NaverPoint {
  x: number;
  y: number;
}

export type NaverConvertedCoordinate = NaverLatLng | NaverPoint;

export interface NaverBounds {
  getSW(): NaverLatLng;
  getNE(): NaverLatLng;
}

export interface NaverMapInstance {
  destroy(): void;
  getBounds(): NaverBounds;
  getZoom(): number;
  morph(position: NaverLatLng, zoom: number): void;
  panTo(position: NaverLatLng): void;
  setZoom(zoom: number): void;
}

export interface NaverMarkerInstance {
  getPosition(): NaverLatLng;
  setMap(map: NaverMapInstance | null): void;
  setPosition(position: NaverLatLng): void;
}

export interface NaverPolylineInstance {
  setMap(map: NaverMapInstance | null): void;
  setPath(path: NaverLatLng[]): void;
}

export interface NaverMapClickEvent {
  coord: NaverLatLng;
}

export interface NaverMapEventListener {
  eventName: string;
  listener: (event: NaverMapClickEvent) => void;
  listenerId: string;
  target: object;
}

export interface NaverGeocodeItem {
  address?: string;
  point?: NaverPoint;
}

export interface NaverGeocodeResponse {
  result?: {
    items?: NaverGeocodeItem[];
  };
}

export interface NaverMapsApi {
  Map: new (
    element: HTMLElement,
    options: Record<string, unknown>
  ) => NaverMapInstance;
  Marker: new (options: Record<string, unknown>) => NaverMarkerInstance;
  Polyline: new (options: Record<string, unknown>) => NaverPolylineInstance;
  LatLng: new (lat: number, lng: number) => NaverLatLng;
  Point: new (x: number, y: number) => NaverPoint;
  Size: new (width: number, height: number) => NaverPoint;
  Event: {
    addListener(
      instance: object,
      eventName: string,
      handler: (event: NaverMapClickEvent) => void
    ): NaverMapEventListener;
    removeListener(
      listeners: NaverMapEventListener | NaverMapEventListener[]
    ): void;
    clearInstanceListeners(instance: object): void;
  };
  Service: {
    Status: { OK: string };
    geocode(
      options: { address: string },
      callback: (status: string, response: NaverGeocodeResponse) => void
    ): void;
  };
  TransCoord: {
    fromTM128ToLatLng(point: NaverPoint): NaverConvertedCoordinate;
  };
}

interface NaverMapsNamespace {
  maps: NaverMapsApi;
}

declare global {
  interface Window {
    naver: NaverMapsNamespace;
  }
}

export interface NaverMapOptions {
  center: { lat: number; lng: number };
  zoom: number;
}

export type MapSourceType = "sighting" | "shelter";

export interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  type: "point";
  source_type: MapSourceType;
  note?: string;
  photo_keys?: string[];
  occurred_at?: string;
  trait_color?: string;
  trait_size?: string;
  trait_species?: string;
  trait_tags?: string[];
  author_type?: "anon" | "user";
  nickname?: string;
}

export interface ClusterData {
  id: string;
  lat: number;
  lng: number;
  count: number;
  type: "cluster";
  source_type: MapSourceType;
  note?: never;
  photo_keys?: never;
  occurred_at?: never;
}

export type MapItem = ClusterPoint | ClusterData;

export interface ClusterResponse {
  clusters: MapItem[];
}
