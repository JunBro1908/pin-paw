import assert from "node:assert/strict";
import test from "node:test";

let classifyEmbeddingQueueResult;
let classifyEmbeddingEntityResult;

try {
  ({ classifyEmbeddingQueueResult, classifyEmbeddingEntityResult } =
    await import("../../src/shared/lib/embedding-queue.ts"));
} catch {
  // RED: the production boundary does not exist yet.
}

test("does not classify a database error as an empty embedding queue", () => {
  assert.deepEqual(
    classifyEmbeddingQueueResult?.([], new Error("database unavailable")),
    { kind: "error" }
  );
});

test("does not classify an entity lookup error as a missing entity", () => {
  assert.deepEqual(
    classifyEmbeddingEntityResult?.(
      null,
      new Error("entity lookup unavailable")
    ),
    { kind: "error" }
  );
});
