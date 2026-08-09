/**
 * 목격 제보 폼 데이터 타입
 */
export interface SightingFormData {
  photo: File | null;
  photoUrl: string | null;
  lat: number;
  lng: number;
  time: string;
  traitColor: string;
  traitSize: string;
  traitSpecies: string;
  traitTags: string[];
  description: string;
}

/**
 * 폼 검증 에러 타입
 */
export interface SightingFormErrors {
  photo?: string;
  location?: string;
  time?: string;
}

/**
 * 내 제보 목록 API 단건 (GET /api/v1/me/sightings)
 * lat, lng는 지도에서 보기 링크용으로 포함 (목록에서 쿼리 스트링으로 전달)
 * trait_* 는 리스트 카드 태그 표시용
 */
export interface MySightingItem {
  id: string;
  photo_keys: string[];
  occurred_at: string;
  note: string | null;
  created_at: string;
  trait_color?: string | null;
  trait_size?: string | null;
  trait_species?: string | null;
  lat?: number;
  lng?: number;
  approximate_region?: string | null;
}

export interface EditableSighting {
  id: string;
  photo_keys: string[];
  occurred_at: string;
  trait_color: string | null;
  trait_size: string | null;
  trait_species: string | null;
  trait_tags: string[];
  note: string | null;
  lat: number;
  lng: number;
}
