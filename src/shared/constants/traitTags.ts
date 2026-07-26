/**
 * 특이사항 태그 (실험2): 미리 정의된 칩 선택.
 * 장착 / 외형 / 행동. 희귀 일치 보너스, 충돌 패널티.
 */

export type TagCategory = "gear" | "appearance" | "behavior";

export interface TraitTagDef {
  id: string;
  labelKo: string;
  category: TagCategory;
  isRare: boolean;
}

/** 장착: 목줄 있음, 하네스 있음, 옷 착용 */
/** 외형: 흉터, 부상/절뚝, 눈/귀 특이, 꼬리 특이 */
/** 행동: 사람을 잘 따름, 경계심 큼/도망감, 공격성/짖음 */
export const TRAIT_TAGS: TraitTagDef[] = [
  { id: "collar", labelKo: "목줄 있음", category: "gear", isRare: false },
  { id: "harness", labelKo: "하네스 있음", category: "gear", isRare: false },
  { id: "wearing_clothes", labelKo: "옷 착용", category: "gear", isRare: true },
  { id: "scar", labelKo: "흉터", category: "appearance", isRare: true },
  { id: "injury", labelKo: "부상/절뚝", category: "appearance", isRare: true },
  {
    id: "eye_ear_trait",
    labelKo: "눈/귀 특이",
    category: "appearance",
    isRare: true,
  },
  {
    id: "tail_trait",
    labelKo: "꼬리 특이",
    category: "appearance",
    isRare: true,
  },
  {
    id: "follows_people",
    labelKo: "사람을 잘 따름",
    category: "behavior",
    isRare: false,
  },
  {
    id: "wary_runs",
    labelKo: "경계심 큼/도망감",
    category: "behavior",
    isRare: false,
  },
  {
    id: "aggressive_barks",
    labelKo: "공격성/짖음",
    category: "behavior",
    isRare: false,
  },
];

export const TRAIT_TAG_IDS = TRAIT_TAGS.map((t) => t.id);
const TAG_BY_ID = Object.fromEntries(TRAIT_TAGS.map((t) => [t.id, t]));

export function getTagById(id: string): TraitTagDef | undefined {
  return TAG_BY_ID[id];
}

export function isRareTag(id: string): boolean {
  return TAG_BY_ID[id]?.isRare ?? false;
}

/** MVP: 명확 충돌 쌍 (예: 목줄 있음 vs 없음 — 없음은 태그가 없음이므로, 동일 태그의 상반된 표현이 있으면 추가) */
export const TAG_CONFLICT_PAIRS: [string, string][] = [
  // 예: "collar" vs "no_collar" 같은 건 태그가 "없음"이면 선택 안 하면 됨. 필요 시 추가.
];

/** 태그 보너스/패널티 (0~1 스케일 유지) */
export const TAG_MATCH_NORMAL = 0.05;
export const TAG_MATCH_RARE = 0.12;
export const TAG_CONFLICT_PENALTY = 0.15;

/**
 * 두 태그 배열에 대한 보너스/패널티 합.
 * 일치: 일반 +0.05, 희귀 +0.12. 충돌: -0.15.
 */
export function tagBonusPenalty(
  tagsA: string[] | null | undefined,
  tagsB: string[] | null | undefined
): number {
  const setA = new Set(tagsA ?? []);
  const setB = new Set(tagsB ?? []);
  let score = 0;
  for (const id of setA) {
    if (setB.has(id)) {
      score += isRareTag(id) ? TAG_MATCH_RARE : TAG_MATCH_NORMAL;
    }
  }
  for (const [a, b] of TAG_CONFLICT_PAIRS) {
    if ((setA.has(a) && setB.has(b)) || (setA.has(b) && setB.has(a))) {
      score -= TAG_CONFLICT_PENALTY;
    }
  }
  return score;
}
