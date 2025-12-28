/**
 * 목격 제보 폼 데이터 타입
 */
export interface SightingFormData {
  photo: File | null;
  photoUrl: string | null; // 미리보기용 URL
  location: string;
  time: string; // ISO string format
  description: string;
}

/**
 * 폼 검증 에러 타입
 */
export interface SightingFormErrors {
  photo?: string;
  location?: string;
}
