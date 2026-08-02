/** 비교 제외용: 모름/미입력 (DB 저장값) */
export const SPECIES_UNKNOWN = "unknown";

/**
 * 한국에서 흔한 반려견 품종 + 모름.
 * KB 2025 반려동물 보고서 상위 품종과 기존 목록을 합쳐 보강.
 */
export const DOG_BREEDS = [
  SPECIES_UNKNOWN,
  "말티즈",
  "푸들",
  "믹스견",
  "포메라니안",
  "비숑",
  "치와와",
  "시츄",
  "요크셔테리어",
  "진돗개",
  "닥스훈트",
  "웰시코기",
  "보더콜리",
  "골든리트리버",
  "래브라도리트리버",
  "코카스파니엘",
  "프렌치불독",
  "시바견",
  "허스키",
  "비글",
  "퍼그",
  "슈나우저",
  "사모예드",
  "스피츠",
  "페키니즈",
  "미니핀",
  "보스턴테리어",
  "말티푸",
] as const;

export type DogBreed = (typeof DOG_BREEDS)[number];

/** UI 표시: unknown → "모름" */
export function getBreedLabel(value: string | null | undefined): string {
  if (value === SPECIES_UNKNOWN) return "모름";
  return value ?? "";
}
