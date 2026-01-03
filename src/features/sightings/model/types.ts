/**
 * 목격 제보 폼 데이터 타입
 */
export interface SightingFormData {
  photo: File | null;
  photoUrl: string | null;
  lat: number;
  lng: number;
  locationName: string; // 사용자에게 보여줄 위치 이름
  time: string;
  description: string;
}

/**
 * 폼 검증 에러 타입
 */
export interface SightingFormErrors {
  photo?: string;
  location?: string;
}
