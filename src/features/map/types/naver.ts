declare global {
  interface Window {
    naver: any;
  }
}

export interface NaverMapOptions {
  center: { lat: number; lng: number };
  zoom: number;
}

export interface ClusterPoint {
  id: string;
  lat: number;
  lng: number;
  type: "point";
  note?: string;
  photo_keys?: string[];
  occurred_at?: string;
  trait_color?: string;
  trait_size?: string;
  trait_species?: string;
  author_type?: "anon" | "user";
  nickname?: string;
}

export interface ClusterData {
  id: string;
  lat: number;
  lng: number;
  count: number;
  type: "cluster";
  note?: never;
  photo_keys?: never;
  occurred_at?: never;
}

export type MapItem = ClusterPoint | ClusterData;

export interface ClusterResponse {
  clusters: MapItem[];
}
