/**
 * 유실글 등록 폼 데이터
 */
export interface LostPostFormData {
  photo: File | null;
  photoUrl: string | null;
  lat: number;
  lng: number;
  lostAt: string;
  traitColor: string;
  traitSize: string;
  traitSpecies: string;
  description: string;
}

/**
 * API 유실글 단건 (목록/상세 응답)
 */
export interface LostPostItem {
  id: string;
  cover_photo_key: string;
  lost_at: string;
  lost_location?: unknown;
  trait_color: string | null;
  trait_size: string | null;
  trait_species: string | null;
  note: string | null;
  status: "searching" | "found" | "closed";
  embedding_status: string;
  created_at: string;
  updated_at: string;
}
