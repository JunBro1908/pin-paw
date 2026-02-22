/** 유실글·제보 색상 공통 옵션 (단계적 선택용) */
export const TRAIT_COLOR_OPTIONS = [
  "검정",
  "흰색",
  "갈색",
  "회색",
  "크림/연한색",
  "얼룩(복합)",
  "기타",
] as const;

export type TraitColorOption = (typeof TRAIT_COLOR_OPTIONS)[number];

export function isTraitColorOption(
  value: string | null | undefined
): value is TraitColorOption {
  return (
    value != null && (TRAIT_COLOR_OPTIONS as readonly string[]).includes(value)
  );
}
