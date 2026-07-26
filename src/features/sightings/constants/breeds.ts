/** 비교 제외용: 모름/미입력 (DB 저장값) */
export const SPECIES_UNKNOWN = "unknown";

/**
 * 강아지 대표 종: unknown(모름) + 15종 + 믹스견. 첫 값이 unknown이면 UI에서 "모름" 표시.
 */
export const DOG_BREEDS = [
  SPECIES_UNKNOWN,
  "말티즈",
  "푸들",
  "비숑",
  "치와와",
  "닥스훈트",
  "웰시코기",
  "보더콜리",
  "골든리트리버",
  "허스키",
  "진돗개",
  "시츄",
  "포메라니안",
  "코카스파니엘",
  "프렌치불독",
  "요크셔테리어",
  "믹스견",
] as const;

export type DogBreed = (typeof DOG_BREEDS)[number];

/** UI 표시: unknown → "모름" */
export function getBreedLabel(value: string | null | undefined): string {
  if (value === SPECIES_UNKNOWN) return "모름";
  return value ?? "";
}
