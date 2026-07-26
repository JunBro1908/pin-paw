import type { SupabaseClient } from "@supabase/supabase-js";
import { sha256 } from "./hash";

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
  retryAfterSeconds?: number;
  unavailable?: boolean;
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
  const sortedLimits = [...limits].sort((a, b) => a.priority - b.priority);
  const identifierHash = userId ? sha256(`user:${userId}`) : ipHash;

  for (const limit of sortedLimits) {
    const windowSeconds = Math.max(1, Math.floor(limit.windowMs / 1000));
    const { data, error } = await supabase.rpc("consume_rate_limit", {
      p_scope: scope,
      p_identifier_hash: identifierHash,
      p_window_seconds: windowSeconds,
      p_max_requests: limit.maxRequests,
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row || typeof row.allowed !== "boolean") {
      return {
        allowed: false,
        errorMessage: "요청 제한 상태를 확인할 수 없습니다.",
        unavailable: true,
      };
    }
    if (!row.allowed) {
      return {
        allowed: false,
        errorMessage: limit.message,
        count: Number(row.request_count),
        retryAfterSeconds: Number(row.retry_after_seconds),
      };
    }
  }

  // 모든 제한 통과
  return {
    allowed: true,
  };
}

export async function checkRateLimitDimensions(
  supabase: SupabaseClient,
  scope: string,
  ipHash: string,
  userId: string | null,
  limits: RateLimitConfig[]
): Promise<RateLimitResult> {
  const ipResult = await checkRateLimit(
    supabase,
    `${scope}:ip`,
    ipHash,
    null,
    limits
  );
  if (!ipResult.allowed || !userId) return ipResult;

  return checkRateLimit(supabase, `${scope}:user`, ipHash, userId, limits);
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
  search: [
    {
      windowMs: 24 * 60 * 60 * 1000,
      maxRequests: 300,
      message: "오늘의 장소 검색 한도를 초과했습니다.",
      priority: 1,
    },
    {
      windowMs: 60 * 1000,
      maxRequests: 30,
      message: "장소 검색 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      priority: 2,
    },
  ] as RateLimitConfig[],
  map: [
    {
      windowMs: 60 * 1000,
      maxRequests: 120,
      message: "지도 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.",
      priority: 1,
    },
  ] as RateLimitConfig[],
} as const;
