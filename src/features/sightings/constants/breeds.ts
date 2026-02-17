/**
 * 강아지 대표 종 (15종 + 믹스견)
 */
export const DOG_BREEDS = [
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
