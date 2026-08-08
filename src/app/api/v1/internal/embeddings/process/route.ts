import { createServiceRoleSupabase } from "@/shared/supabase/server";
import { createEmbeddings, getTraitTexts } from "@/shared/lib/embedding";
import { createCronAuthorizedValue } from "@/shared/lib/cron-auth";
import {
  classifyEmbeddingEntityResult,
  classifyEmbeddingQueueResult,
} from "@/shared/lib/embedding-queue";
import {
  getEmbeddingWorkerStatus,
  processEmbeddingJob,
} from "@/shared/lib/embedding-job-processor";
import { parsePagination } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";
import {
  estimateEmbeddingCostUsdMicros,
  recordOperationalCounter,
} from "@/shared/lib/operational-metrics";

interface ClaimedEmbeddingJob {
  id: string;
  entity_type: "sighting" | "lost_post";
  entity_id: string;
  lease_token: string;
}

class EmbeddingJobFailure extends Error {
  constructor(
    readonly code: string,
    readonly dependencyUnavailable = false
  ) {
    super(code);
  }
}

/**
 * Worker: lease RPC로 claim한 임베딩 건을 entity 단위로 처리
 * entity당 4문장(종·색·크기·메모) → 1회 API 호출 → 1 row 4컬럼 갱신
 * POST /api/v1/internal/embeddings/process?batch=10
 */
export async function POST(request: Request) {
  const logger = createRequestLogger(
    request,
    "/api/v1/internal/embeddings/process"
  );
  const authorization = createCronAuthorizedValue(
    process.env.CRON_SECRET,
    request.headers.get("Authorization"),
    createServiceRoleSupabase
  );

  if (!authorization.ok) {
    return new Response(
      JSON.stringify({ success: false, error: authorization.error }),
      {
        status: authorization.status,
        headers: { "Content-Type": "application/json" },
      }
    );
  }

  const supabase = authorization.value;
  const { searchParams } = new URL(request.url);
  const batchResult = parsePagination(searchParams.get("batch"), null, 10, 20);
  if (!batchResult.ok) {
    return new Response(
      JSON.stringify({
        success: false,
        error: {
          code: "INVALID_PARAMS",
          message: "batch가 유효하지 않습니다.",
        },
      }),
      { status: 400, headers: { "Content-Type": "application/json" } }
    );
  }
  const batch = batchResult.value.limit;

  const { data: claimedRows, error } = await supabase.rpc(
    "claim_embedding_jobs",
    {
      p_batch_size: batch,
      p_lease_seconds: 300,
    }
  );
  const hasValidClaimPayload = Array.isArray(claimedRows);
  const rows = hasValidClaimPayload
    ? (claimedRows as ClaimedEmbeddingJob[])
    : null;

  const queueResult = classifyEmbeddingQueueResult(
    rows,
    error ?? (hasValidClaimPayload ? null : new Error("invalid claim payload"))
  );

  if (queueResult.kind === "error") {
    logger.error("embedding.queue_claim_failed", {
      error,
      status: 503,
    });
    return new Response(
      JSON.stringify({
        success: false,
        error: "Embedding queue unavailable",
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  if (queueResult.kind === "empty") {
    return new Response(
      JSON.stringify({
        success: true,
        processed: 0,
        message: "No pending items",
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  }

  let processed = 0;
  let failed = 0;
  let lostLease = 0;
  let dependencyUnavailable = false;

  for (const row of queueResult.rows) {
    const {
      entity_type: entityType,
      entity_id: entityId,
      lease_token: leaseToken,
    } = row;

    try {
      let traitTexts: [
        string | null,
        string | null,
        string | null,
        string | null,
      ];
      if (entityType === "sighting") {
        const { data: sighting, error: sightingError } = await supabase
          .from("sightings")
          .select("trait_species, trait_color, trait_size, trait_tags, note")
          .eq("id", entityId)
          .maybeSingle();
        const sightingResult = classifyEmbeddingEntityResult(
          sighting,
          sightingError
        );
        if (sightingResult.kind === "error") {
          throw new EmbeddingJobFailure("entity_lookup_failed", true);
        }
        if (sightingResult.kind === "missing") {
          const { data: removed, error: removeError } = await supabase.rpc(
            "fail_embedding_job",
            {
              p_embedding_id: row.id,
              p_lease_token: leaseToken,
              p_error_code: "entity_missing",
              p_permanent: true,
            }
          );
          if (removeError) {
            dependencyUnavailable = true;
            failed++;
          } else if (!removed) {
            lostLease++;
          }
          continue;
        }
        traitTexts = getTraitTexts({
          traitSpecies: sightingResult.entity.trait_species,
          traitColor: sightingResult.entity.trait_color,
          traitSize: sightingResult.entity.trait_size,
          traitTags: sightingResult.entity.trait_tags,
          note: sightingResult.entity.note,
        });
      } else {
        const { data: lostPost, error: lostPostError } = await supabase
          .from("lost_posts")
          .select("trait_species, trait_color, trait_size, trait_tags, note")
          .eq("id", entityId)
          .maybeSingle();
        const lostPostResult = classifyEmbeddingEntityResult(
          lostPost,
          lostPostError
        );
        if (lostPostResult.kind === "error") {
          throw new EmbeddingJobFailure("entity_lookup_failed", true);
        }
        if (lostPostResult.kind === "missing") {
          const { data: removed, error: removeError } = await supabase.rpc(
            "fail_embedding_job",
            {
              p_embedding_id: row.id,
              p_lease_token: leaseToken,
              p_error_code: "entity_missing",
              p_permanent: true,
            }
          );
          if (removeError) {
            dependencyUnavailable = true;
            failed++;
          } else if (!removed) {
            lostLease++;
          }
          continue;
        }
        traitTexts = getTraitTexts({
          traitSpecies: lostPostResult.entity.trait_species,
          traitColor: lostPostResult.entity.trait_color,
          traitSize: lostPostResult.entity.trait_size,
          traitTags: lostPostResult.entity.trait_tags,
          note: lostPostResult.entity.note,
        });
      }

      const result = await processEmbeddingJob(
        {
          id: row.id,
          leaseToken,
          traitTexts,
        },
        {
          createEmbeddings: async (texts) => {
            const vectors = await createEmbeddings(texts);
            const recorded = await recordOperationalCounter(supabase, {
              metric: "embedding_request",
              eventCount: 1,
              estimatedCostUsdMicros: estimateEmbeddingCostUsdMicros(texts),
            });
            if (!recorded) {
              logger.warn("embedding.cost_metric_failed");
            }
            return vectors;
          },
          completeJob: async (input) => {
            const { data, error } = await supabase.rpc(
              "complete_embedding_job",
              {
                p_embedding_id: input.embeddingId,
                p_lease_token: input.leaseToken,
                p_embeddings: input.embeddings,
              }
            );
            return { completed: data === true, error };
          },
          failJob: async (input) => {
            const { data, error } = await supabase.rpc("fail_embedding_job", {
              p_embedding_id: input.embeddingId,
              p_lease_token: input.leaseToken,
              p_error_code: input.errorCode,
              p_permanent: input.permanent,
            });
            return { recorded: data === true, error };
          },
        }
      );

      if (result.kind === "lost_lease") {
        lostLease++;
        continue;
      }
      if (result.kind === "failed") {
        dependencyUnavailable ||= result.dependencyUnavailable;
        failed++;
        if (result.lostLease) {
          lostLease++;
        }
        logger.error("embedding.job_failed", {
          entityType,
          code: result.code,
        });
        continue;
      }
      processed++;
    } catch (err) {
      const failure =
        err instanceof EmbeddingJobFailure
          ? err
          : new EmbeddingJobFailure("worker_failed");
      dependencyUnavailable ||= failure.dependencyUnavailable;
      logger.error("embedding.job_failed", {
        entityType,
        code: failure.code,
      });

      const { data: recorded, error: failureError } = await supabase.rpc(
        "fail_embedding_job",
        {
          p_embedding_id: row.id,
          p_lease_token: leaseToken,
          p_error_code: failure.code,
          p_permanent: false,
        }
      );

      if (failureError) {
        dependencyUnavailable = true;
      } else if (!recorded) {
        lostLease++;
      }
      failed++;
    }
  }

  return new Response(
    JSON.stringify({
      success: !dependencyUnavailable,
      processed,
      failed,
      lostLease,
    }),
    {
      status: getEmbeddingWorkerStatus(dependencyUnavailable),
      headers: { "Content-Type": "application/json" },
    }
  );
}

// Vercel Cron invokes configured paths with GET; internal callers may keep POST.
export const GET = POST;
