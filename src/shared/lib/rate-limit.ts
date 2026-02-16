import { SupabaseClient } from "@supabase/supabase-js";

/**
 * Rate Limit 설정
 */
export interface RateLimitConfig {
  windowMs: number; // 시간 윈도우 (밀리초)
  maxRequests: number; // 최대 요청 수
  message: string; // 제한 초과 시 표시할 메시지
  priority: number; // 우선순위 (낮을수록 높은 우선순위)
}

/**
 * Rate Limit 체크 결과
 */
export interface RateLimitResult {
  allowed: boolean;
  errorMessage?: string;
  count?: number;
}

/**
 * DB 기반 Rate Limit 체크 (우선순위 기반)
 *
 * @param supabase - Supabase 클라이언트
 * @param scope - Rate Limit 범위 (예: "uploads:presign", "sighting:submit")
 * @param ipHash - IP 해시
 * @param userId - 사용자 ID (선택)
 * @param limits - Rate Limit 설정 배열 (우선순위 순으로 정렬)
 * @returns 허용 여부 및 에러 메시지
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  scope: string,
  ipHash: string,
  userId: string | null,
  limits: RateLimitConfig[]
): Promise<RateLimitResult> {
  const now = new Date();

  // 우선순위 순으로 체크 (priority 오름차순 정렬)
  const sortedLimits = [...limits].sort((a, b) => a.priority - b.priority);

  for (const limit of sortedLimits) {
    const cutoffTime = new Date(now.getTime() - limit.windowMs);

    const query = supabase
      .from("idempotency_keys")
      .select("*", { count: "exact", head: true })
      .eq("scope", scope)
      .gte("created_at", cutoffTime.toISOString());

    // userId가 있으면 userId로, 없으면 ipHash로 조회
    if (userId) {
      query.eq("owner_id", userId);
    } else {
      query.eq("ip_hash", ipHash);
    }

    const { count } = await query;

    // 제한 초과 시 즉시 반환 (우선순위가 높은 제한)
    if (count !== null && count >= limit.maxRequests) {
      return {
        allowed: false,
        errorMessage: limit.message,
        count,
      };
    }
  }

  // 모든 제한 통과
  return {
    allowed: true,
  };
}

/**
 * 사전 정의된 Rate Limit 설정
 */
export const RateLimitPresets = {
  /**
   * 제보 관련 Rate Limit (비회원)
   * presign과 sightings 모두에서 사용
   */
  sighting: [
    {
      windowMs: 24 * 60 * 60 * 1000, // 24시간
      maxRequests: 30,
      message:
        "하루 동안 최대 30회까지 제보할 수 있습니다. 내일 다시 시도해주세요.",
      priority: 1, // 최우선
    },
    {
      windowMs: 60 * 60 * 1000, // 1시간
      maxRequests: 10,
      message:
        "1시간 동안 최대 10회까지 제보할 수 있습니다. 잠시 후 다시 시도해주세요.",
      priority: 2,
    },
    {
      windowMs: 10 * 1000, // 10초
      maxRequests: 1,
      message: "잠시 후 다시 시도해주세요. (10초 쿨다운)",
      priority: 3, // 최하위
    },
  ] as RateLimitConfig[],
} as const;
