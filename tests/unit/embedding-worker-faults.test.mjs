import assert from "node:assert/strict";
import test from "node:test";

let processEmbeddingJob;
let getEmbeddingWorkerStatus;

try {
  ({ processEmbeddingJob, getEmbeddingWorkerStatus } = await import(
    "../../src/shared/lib/embedding-job-processor.ts"
  ));
} catch {
  // RED: the injectable worker boundary does not exist yet.
}

const job = {
  id: "embedding-1",
  leaseToken: "lease-1",
  traitTexts: ["고양이", "검정", null, "provider raw secret"],
};

test("provider 오류는 안전한 코드로 fail RPC에 기록하고 재시도한다", async () => {
  const rawError = new Error("provider raw secret");
  const failCalls = [];

  const result = await processEmbeddingJob?.(job, {
    createEmbeddings: async () => {
      throw rawError;
    },
    completeJob: async () => ({ completed: true, error: null }),
    failJob: async (input) => {
      failCalls.push(input);
      return { recorded: true, error: null };
    },
  });

  assert.deepEqual(result, {
    kind: "failed",
    code: "provider_failed",
    dependencyUnavailable: false,
    lostLease: false,
  });
  assert.deepEqual(failCalls, [
    {
      embeddingId: "embedding-1",
      leaseToken: "lease-1",
      errorCode: "provider_failed",
      permanent: false,
    },
  ]);
  assert.equal(JSON.stringify(failCalls).includes(rawError.message), false);
});

test("complete RPC 오류는 dependency unavailable 실패로 분류한다", async () => {
  const failCalls = [];

  const result = await processEmbeddingJob?.(job, {
    createEmbeddings: async () => [[1], [2], [3]],
    completeJob: async () => ({
      completed: false,
      error: new Error("database unavailable"),
    }),
    failJob: async (input) => {
      failCalls.push(input);
      return { recorded: true, error: null };
    },
  });

  assert.deepEqual(result, {
    kind: "failed",
    code: "finalize_failed",
    dependencyUnavailable: true,
    lostLease: false,
  });
  assert.equal(getEmbeddingWorkerStatus?.(result.dependencyUnavailable), 503);
  assert.equal(failCalls[0].errorCode, "finalize_failed");
});

test("complete RPC가 false이면 lease lost로 처리하고 fail RPC를 호출하지 않는다", async () => {
  let failCalled = false;

  const result = await processEmbeddingJob?.(job, {
    createEmbeddings: async () => [[1], [2], [3]],
    completeJob: async () => ({ completed: false, error: null }),
    failJob: async () => {
      failCalled = true;
      return { recorded: true, error: null };
    },
  });

  assert.deepEqual(result, { kind: "lost_lease" });
  assert.equal(failCalled, false);
});

test("fail RPC가 false이면 provider 실패와 lease lost를 함께 집계한다", async () => {
  const result = await processEmbeddingJob?.(job, {
    createEmbeddings: async () => {
      throw new Error("provider unavailable");
    },
    completeJob: async () => ({ completed: true, error: null }),
    failJob: async () => ({ recorded: false, error: null }),
  });

  assert.deepEqual(result, {
    kind: "failed",
    code: "provider_failed",
    dependencyUnavailable: false,
    lostLease: true,
  });
});
