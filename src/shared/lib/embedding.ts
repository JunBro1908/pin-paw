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
  note?: string | null;
};

/**
 * 필드별 임베딩용 문장 4개 반환 [종, 색, 크기, 메모] 순서 (EMBEDDING_TRAITS와 동일)
 * 문맥 문장 형식으로 구분력 향상. 정보 없음이면 null → 해당 필드는 임베딩하지 않고 DB에 NULL 저장
 */
export function getTraitTexts(
  attrs: TraitAttrs
): [string | null, string | null, string | null, string | null] {
  return [
    attrs.traitSpecies
      ? `이 유실 반려동물의 종은 ${attrs.traitSpecies}입니다.`
      : null,
    attrs.traitColor
      ? `이 유실 반려동물의 털 색상은 ${attrs.traitColor}입니다.`
      : null,
    attrs.traitSize
      ? `이 유실 반려동물의 크기는 ${attrs.traitSize}입니다.`
      : null,
    attrs.note
      ? `이 유실 반려동물에 대한 메모는 ${attrs.note}입니다.`
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
