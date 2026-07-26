/**
 * 색상 토큰 (실험2): UI/DB/추천 공용.
 * - 색상군 + 패턴 2종. 자유 텍스트 → 토큰 세트로 정규화.
 * - Jaccard + 충돌 페널티로 유사도 계산, 임베딩 미사용.
 */

/** 색상군 토큰 ID → 한글 키워드 (구체 표현 앞에 둠) */
export const COLOR_GROUP_KEYWORDS: Record<string, string[]> = {
  white: ["아이보리", "크림", "연한색", "밝은색", "흰색", "흰", "하양", "백"],
  black: ["검정", "까만", "흑"],
  brown: ["진갈", "연갈", "금색", "황색", "베이지", "초코", "브라운", "갈색"],
  gray: ["회색", "그레이", "은색"],
  orange: ["주황"],
  gold: ["황금", "골드"],
  other: ["기타", "그외"],
  unknown: ["모름", "모르겠음"],
};

/** 패턴 토큰 ID → 한글 키워드 */
export const PATTERN_KEYWORDS: Record<string, string[]> = {
  pattern_spotted: ["얼룩", "점박이", "무늬"],
  pattern_striped: ["줄무늬", "줄"],
  pattern_two_tone: ["투톤", "배색", "부분색"],
  pattern_tricolor: ["삼색"],
  pattern_mask: ["마스크", "얼굴만 검정"],
};

/** MVP: 강충돌 쌍 (white–black만). 있으면 sim_color *= 0.2 */
export const COLOR_CONFLICT_PAIRS: [string, string][] = [["white", "black"]];

/** 모든 색상군 + 패턴 키워드 (추출용). 구체 표현 우선을 위해 긴 키워드부터 정렬 */
const ALL_TOKEN_KEYWORDS: { token: string; keyword: string }[] = [];

for (const [token, keywords] of Object.entries(COLOR_GROUP_KEYWORDS)) {
  for (const k of keywords) ALL_TOKEN_KEYWORDS.push({ token, keyword: k });
}
for (const [token, keywords] of Object.entries(PATTERN_KEYWORDS)) {
  for (const k of keywords) ALL_TOKEN_KEYWORDS.push({ token, keyword: k });
}
ALL_TOKEN_KEYWORDS.sort((a, b) => b.keyword.length - a.keyword.length);

/**
 * 자유 텍스트 → 색상 토큰 ID 세트 (색상군 + 패턴).
 * 키워드 매칭(구체 표현 우선).
 */
export function extractColorTokens(text: string | null | undefined): string[] {
  if (!text || typeof text !== "string") return [];
  const normalized = text.trim().toLowerCase();
  if (!normalized) return [];
  const set = new Set<string>();
  for (const { token, keyword } of ALL_TOKEN_KEYWORDS) {
    if (normalized.includes(keyword.toLowerCase())) set.add(token);
  }
  return Array.from(set);
}

/** 두 토큰 세트 간 강충돌 존재 여부 (MVP: white–black) */
export function hasColorConflict(
  tokensA: string[],
  tokensB: string[] | null | undefined
): boolean {
  if (!tokensB?.length) return false;
  const setB = new Set(tokensB);
  for (const [a, b] of COLOR_CONFLICT_PAIRS) {
    if (
      (tokensA.includes(a) && setB.has(b)) ||
      (tokensA.includes(b) && setB.has(a))
    )
      return true;
  }
  return false;
}

/** Jaccard(교집합/합집합). 빈 세트면 0. */
export function jaccard(a: string[], b: string[] | null | undefined): number {
  if (!a.length && (!b || !b.length)) return 0;
  const setA = new Set(a);
  const setB = new Set(b ?? []);
  let intersection = 0;
  for (const x of setA) {
    if (setB.has(x)) intersection++;
  }
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}

/**
 * 색상 유사도: Jaccard 기반, 충돌 시 0.2 배.
 * sim_color_base = jaccard(A,B), 충돌 있으면 sim_color = sim_color_base * 0.2
 */
export function colorSimilarity(
  tokensA: string[],
  tokensB: string[] | null | undefined
): number {
  const base = jaccard(tokensA, tokensB);
  if (hasColorConflict(tokensA, tokensB)) return base * 0.2;
  return base;
}

// --- 레거시: 기존 드롭다운용 (필요 시 UI에서만 참조)
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
