import OpenAI from "openai";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

export const EMBEDDING_TRAITS = ["species", "color", "size", "note"] as const;
export type EmbeddingTrait = (typeof EMBEDDING_TRAITS)[number];

/**
 * 임베딩용 텍스트 직렬화 (종·색상·크기·메모만, 위치/시간은 pre-filter용)
 * @deprecated 필드별 임베딩 시에는 getTraitTexts 사용
 */
export function serializeTraitsToText(attrs: {
  traitSpecies?: string | null;
  traitColor?: string | null;
  traitSize?: string | null;
  note?: string | null;
}): string {
  const parts: string[] = [];
  if (attrs.traitSpecies)
    parts.push(`이 유실 반려동물의 종은 ${attrs.traitSpecies}입니다.`);
  if (attrs.traitColor)
    parts.push(`이 유실 반려동물의 털 색상은 ${attrs.traitColor}입니다.`);
  if (attrs.traitSize)
    parts.push(`이 유실 반려동물의 크기는 ${attrs.traitSize}입니다.`);
  if (attrs.note)
    parts.push(`이 유실 반려동물에 대한 메모는 ${attrs.note}입니다.`);
  const text = parts.join(" ");
  return text || "특징 없음";
}

export type TraitAttrs = {
  traitSpecies?: string | null;
  traitColor?: string | null;
  traitSize?: string | null;
  traitTags?: readonly string[] | null;
  note?: string | null;
};

function normalizeEmbeddingValue(value: string): string {
  return value.trim().replace(/\s+/g, " ");
}

function serializeTags(
  tags: readonly string[] | null | undefined
): string | null {
  const normalized = [
    ...new Set((tags ?? []).map(normalizeEmbeddingValue).filter(Boolean)),
  ];
  return normalized.length > 0 ? normalized.join(", ") : null;
}

/**
 * 필드별 임베딩용 문장 4개 반환 [종, 색, 크기, 메모] 순서 (EMBEDDING_TRAITS와 동일)
 * 문맥 문장 형식으로 구분력 향상. 정보 없음이면 null → 해당 필드는 임베딩하지 않고 DB에 NULL 저장
 */
export function getTraitTexts(
  attrs: TraitAttrs
): [string | null, string | null, string | null, string | null] {
  const tags = serializeTags(attrs.traitTags);
  const tagContext = tags ? ` 특이사항 태그는 ${tags}입니다.` : "";
  return [
    attrs.traitSpecies
      ? `대상 동물 정보. 종: ${normalizeEmbeddingValue(attrs.traitSpecies)}.${tagContext}`
      : null,
    attrs.traitColor
      ? `반려동물 외형 색상 판별 정보. 색상과 무늬만 해석한다. 색상/무늬 표현: ${normalizeEmbeddingValue(attrs.traitColor)}. 단색, 얼룩, 점박이, 줄무늬, 투톤, 삼색 등의 표현 차이를 보존한다.`
      : null,
    attrs.traitSize
      ? `대상 동물 정보. 크기: ${normalizeEmbeddingValue(attrs.traitSize)}.${tagContext}`
      : null,
    attrs.note
      ? `대상 동물의 추가 관찰 메모: ${normalizeEmbeddingValue(attrs.note)}.`
      : tags
        ? `대상 동물의 특이사항 태그: ${tags}.`
        : null,
  ];
}

/**
 * OpenAI text-embedding-3-small로 텍스트 임베딩 1개 생성
 */
export async function createEmbedding(text: string): Promise<number[]> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const openai = new OpenAI({ apiKey });
  const { data } = await openai.embeddings.create({
    model: MODEL,
    input: text,
    dimensions: DIMENSIONS,
  });
  const vector = data[0]?.embedding;
  if (!vector || vector.length !== DIMENSIONS) {
    throw new Error("Invalid embedding response");
  }
  return vector;
}

/**
 * OpenAI text-embedding-3-small로 여러 문장을 한 번에 임베딩 (entity당 4문장 배치용)
 * 반환 순서는 input texts 순서와 동일
 */
export async function createEmbeddings(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not set");
  }
  const openai = new OpenAI({ apiKey });
  const { data } = await openai.embeddings.create({
    model: MODEL,
    input: texts,
    dimensions: DIMENSIONS,
  });
  if (!data || data.length !== texts.length) {
    throw new Error("Invalid embedding response");
  }
  const vectors = data
    .sort((a, b) => a.index - b.index)
    .map((d) => d.embedding);
  if (vectors.some((v) => !v || v.length !== DIMENSIONS)) {
    throw new Error("Invalid embedding response");
  }
  return vectors;
}
