declare global {
  interface Window {
    naver: any;
  }
}

export interface NaverMapOptions {
  center: { lat: number; lng: number };
  zoom: number;
}

