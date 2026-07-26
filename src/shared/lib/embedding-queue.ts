export type EmbeddingQueueResult<T> =
  | { kind: "error" }
  | { kind: "empty" }
  | { kind: "items"; rows: T[] };

export type EmbeddingEntityResult<T> =
  | { kind: "error" }
  | { kind: "missing" }
  | { kind: "found"; entity: T };

export function classifyEmbeddingQueueResult<T>(
  rows: T[] | null,
  error: unknown
): EmbeddingQueueResult<T> {
  if (error) {
    return { kind: "error" };
  }

  if (!rows?.length) {
    return { kind: "empty" };
  }

  return { kind: "items", rows };
}

export function classifyEmbeddingEntityResult<T>(
  entity: T | null,
  error: unknown
): EmbeddingEntityResult<T> {
  if (error) {
    return { kind: "error" };
  }

  if (!entity) {
    return { kind: "missing" };
  }

  return { kind: "found", entity };
}
