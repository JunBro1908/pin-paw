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
  // Add other sighting fields if needed
}

export interface ClusterData {
  id: string;
  lat: number;
  lng: number;
  count: number;
  type: "cluster";
}

export type MapItem = ClusterPoint | ClusterData;

export interface ClusterResponse {
  clusters: MapItem[];
}

