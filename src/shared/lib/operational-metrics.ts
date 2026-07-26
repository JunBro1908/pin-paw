import type { SupabaseClient } from "@supabase/supabase-js";
import type { ApiObservation } from "@/shared/lib/structured-log";

export const COST_ESTIMATES_USD_MICROS = {
  naverLocalSearchRequest: 0,
  embeddingToken: 0.02,
} as const;

export function estimateEmbeddingCostUsdMicros(texts: string[]): number {
  const estimatedTokens = Math.ceil(
    texts.reduce((total, text) => total + text.length, 0) / 4
  );
  return Math.max(
    1,
    Math.ceil(estimatedTokens * COST_ESTIMATES_USD_MICROS.embeddingToken)
  );
}

export async function recordApiObservation(
  supabase: SupabaseClient,
  observation: ApiObservation
): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_api_observation", {
    p_route_class: observation.routeClass,
    p_method: observation.method,
    p_status: observation.status,
    p_duration_ms: observation.durationMs,
  });
  return error === null && data === true;
}

export async function recordOperationalCounter(
  supabase: SupabaseClient,
  input: {
    metric:
      | "embedding_request"
      | "naver_local_search"
      | "upload_cleanup_failure";
    eventCount?: number;
    estimatedCostUsdMicros?: number;
  }
): Promise<boolean> {
  const { data, error } = await supabase.rpc("record_operational_counter", {
    p_metric: input.metric,
    p_event_count: input.eventCount ?? 1,
    p_estimated_cost_usd_micros: input.estimatedCostUsdMicros ?? 0,
  });
  return error === null && data === true;
}
