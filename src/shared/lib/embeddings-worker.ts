import { runWithCronAuthorizationHeader } from "@/shared/lib/cron-auth";
import { getInternalEmbeddingsProcessUrl } from "@/shared/lib/app-origin";
import {
  createLogger,
  type StructuredLogger,
} from "@/shared/lib/structured-log";

/**
 * Worker 엔드포인트를 fire-and-forget으로 호출 (응답 대기 없음)
 */
const MAX_BATCH = 10;

export function getEmbeddingsProcessUrl(): string | null {
  return getInternalEmbeddingsProcessUrl(process.env.APP_ORIGIN, MAX_BATCH);
}

export function triggerEmbeddingsProcess(
  logger: Pick<StructuredLogger, "warn"> = createLogger({
    component: "embeddings_worker_trigger",
  })
): void {
  const url = getEmbeddingsProcessUrl();
  if (!url) {
    logger.warn("embedding.trigger_skipped", {
      reason: "app_origin_invalid",
    });
    return;
  }

  const didTrigger = runWithCronAuthorizationHeader(
    process.env.CRON_SECRET,
    (authorizationHeader) => {
      fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authorizationHeader,
        },
      }).catch((err) => {
        logger.warn("embedding.trigger_failed", { error: err });
      });
    }
  );

  if (!didTrigger) {
    logger.warn("embedding.trigger_skipped", {
      reason: "cron_secret_missing",
    });
  }
}
