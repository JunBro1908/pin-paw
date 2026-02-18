/**
 * Worker 엔드포인트를 fire-and-forget으로 호출 (응답 대기 없음)
 */
const MAX_BATCH = 10;

export function getEmbeddingsProcessUrl(request: Request): string {
  const url = new URL(request.url);
  return `${url.origin}/api/v1/internal/embeddings/process?batch=${MAX_BATCH}`;
}

export function triggerEmbeddingsProcess(request: Request): void {
  const url = getEmbeddingsProcessUrl(request);
  fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(process.env.CRON_SECRET
        ? { Authorization: `Bearer ${process.env.CRON_SECRET}` }
        : {}),
    },
  }).catch((err) => {
    console.warn("[embeddings] fire-and-forget worker trigger failed:", err);
  });
}
