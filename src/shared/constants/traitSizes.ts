/**
 * 크기 옵션 (실험2): 소/중/대 + 모름.
 * 값: small | medium | large | unknown.
 * 인접 점수: 동일 1, 인접 0.7, 한 칸 0.3.
 */

export const SIZE_VALUES = ["small", "medium", "large", "unknown"] as const;
export type SizeValue = (typeof SIZE_VALUES)[number];

/** UI 라벨 */
export const SIZE_LABELS: Record<SizeValue, string> = {
  small: "소",
  medium: "중",
  large: "대",
  unknown: "모름",
};

/** 기존 UI 값(소/중/대) → 내부 값 */
export function normalizeSize(
  value: string | null | undefined
): SizeValue | null {
  if (value == null || value === "") return "unknown";
  const v = value.trim().toLowerCase();
  if (v === "소" || v === "small") return "small";
  if (v === "중" || v === "medium") return "medium";
  if (v === "대" || v === "large") return "large";
  if (v === "모름" || v === "unknown") return "unknown";
  return null;
}

/** 저장 enum을 사용자용 크기 라벨로 변환한다. */
export function formatDogSizeLabel(
  value: string | null | undefined
): string | null {
  const size = normalizeSize(value);
  if (!size || size === "unknown") return null;

  const labels: Record<Exclude<SizeValue, "unknown">, string> = {
    small: "소형견",
    medium: "중형견",
    large: "대형견",
  };
  return labels[size];
}

/** 비교 제외: null 또는 unknown이면 true */
export function isSizeExcluded(value: SizeValue | null | undefined): boolean {
  return value == null || value === "unknown";
}

/** 인접 점수: 동일 1, 인접(소-중, 중-대) 0.7, 한 칸(소-대) 0.3 */
const ORDER: Record<SizeValue, number> = {
  small: 0,
  medium: 1,
  large: 2,
  unknown: -1,
};

export function sizeSimilarity(
  a: SizeValue | null | undefined,
  b: SizeValue | null | undefined
): number {
  const va = normalizeSize(a ?? undefined);
  const vb = normalizeSize(b ?? undefined);
  if (!va || !vb || va === "unknown" || vb === "unknown") return 0;
  const oa = ORDER[va];
  const ob = ORDER[vb];
  const dist = Math.abs(oa - ob);
  if (dist === 0) return 1;
  if (dist === 1) return 0.7;
  return 0.3;
}
