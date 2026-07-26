type TraitTexts = [
  string | null,
  string | null,
  string | null,
  string | null,
];

interface EmbeddingJobInput {
  id: string;
  leaseToken: string;
  traitTexts: TraitTexts;
}

interface FailureInput {
  embeddingId: string;
  leaseToken: string;
  errorCode: string;
  permanent: false;
}

interface EmbeddingJobDependencies {
  createEmbeddings(texts: string[]): Promise<number[][]>;
  completeJob(input: {
    embeddingId: string;
    leaseToken: string;
    embeddings: {
      species: number[] | null;
      color: number[] | null;
      size: number[] | null;
      note: number[] | null;
    };
  }): Promise<{ completed: boolean; error: unknown | null }>;
  failJob(
    input: FailureInput
  ): Promise<{ recorded: boolean; error: unknown | null }>;
}

export type EmbeddingJobResult =
  | { kind: "processed" }
  | { kind: "lost_lease" }
  | {
      kind: "failed";
      code: "provider_failed" | "finalize_failed";
      dependencyUnavailable: boolean;
      lostLease: boolean;
    };

export function getEmbeddingWorkerStatus(
  dependencyUnavailable: boolean
): 200 | 503 {
  return dependencyUnavailable ? 503 : 200;
}

async function recordRetryableFailure(
  job: EmbeddingJobInput,
  code: "provider_failed" | "finalize_failed",
  dependencyUnavailable: boolean,
  failJob: EmbeddingJobDependencies["failJob"]
): Promise<EmbeddingJobResult> {
  const { recorded, error } = await failJob({
    embeddingId: job.id,
    leaseToken: job.leaseToken,
    errorCode: code,
    permanent: false,
  });

  return {
    kind: "failed",
    code,
    dependencyUnavailable: dependencyUnavailable || error != null,
    lostLease: error == null && !recorded,
  };
}

export async function processEmbeddingJob(
  job: EmbeddingJobInput,
  dependencies: EmbeddingJobDependencies
): Promise<EmbeddingJobResult> {
  const indices = [0, 1, 2, 3].filter(
    (index) => job.traitTexts[index] != null
  );
  const texts = indices.map((index) => job.traitTexts[index] as string);

  let vectors: number[][];
  try {
    vectors =
      texts.length > 0 ? await dependencies.createEmbeddings(texts) : [];
  } catch {
    return recordRetryableFailure(
      job,
      "provider_failed",
      false,
      dependencies.failJob
    );
  }

  const embeddings = {
    species: indices.includes(0) ? vectors[indices.indexOf(0)] : null,
    color: indices.includes(1) ? vectors[indices.indexOf(1)] : null,
    size: indices.includes(2) ? vectors[indices.indexOf(2)] : null,
    note: indices.includes(3) ? vectors[indices.indexOf(3)] : null,
  };
  const { completed, error } = await dependencies.completeJob({
    embeddingId: job.id,
    leaseToken: job.leaseToken,
    embeddings,
  });

  if (error != null) {
    return recordRetryableFailure(
      job,
      "finalize_failed",
      true,
      dependencies.failJob
    );
  }
  if (!completed) {
    return { kind: "lost_lease" };
  }
  return { kind: "processed" };
}
