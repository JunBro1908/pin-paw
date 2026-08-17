/**
 * 유실글 등록 폼 데이터
 */
export interface LostPostFormData {
  photo: File | null;
  photoUrl: string | null;
  photos: File[];
  photoUrls: string[];
  lat: number;
  lng: number;
  petName: string;
  lostAt: string;
  traitColor: string;
  traitSize: string;
  traitSpecies: string;
  traitTags: string[];
  description: string;
}

/**
 * API 유실글 단건 (목록/상세 응답)
 */
export interface LostPostItem {
  id: string;
  cover_photo_key: string;
  photo_keys?: string[];
  pet_name: string;
  lost_at: string;
  lost_location?: unknown;
  approximate_region?: string | null;
  trait_color: string | null;
  trait_size: string | null;
  trait_species: string | null;
  trait_tags: string[] | null;
  note: string | null;
  status: "searching" | "found" | "closed";
  embedding_status: string;
  created_at: string;
  updated_at: string;
}
