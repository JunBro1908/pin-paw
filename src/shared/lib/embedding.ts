import OpenAI from "openai";

const MODEL = "text-embedding-3-small";
const DIMENSIONS = 1536;

/**
 * 임베딩용 텍스트 직렬화 (종·색상·크기·메모만, 위치/시간은 pre-filter용)
 */
export function serializeTraitsToText(attrs: {
  traitSpecies?: string | null;
  traitColor?: string | null;
  traitSize?: string | null;
  note?: string | null;
}): string {
  const parts: string[] = [];
  if (attrs.traitSpecies) parts.push(`종: ${attrs.traitSpecies}`);
  if (attrs.traitColor) parts.push(`색상: ${attrs.traitColor}`);
  if (attrs.traitSize) parts.push(`크기: ${attrs.traitSize}`);
  if (attrs.note) parts.push(`메모: ${attrs.note}`);
  const text = parts.join(" ");
  return text || "특징 없음";
}

/**
 * OpenAI text-embedding-3-small로 텍스트 임베딩 생성
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
