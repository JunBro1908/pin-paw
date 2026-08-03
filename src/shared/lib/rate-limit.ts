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
  /**
   * fixed_window: Unix epoch 정렬 버킷 (1h/24h 한도)
   * cooldown: 마지막 허용 시각 기준 최소 간격 (15초 쿨다운)
   */
  strategy?: "fixed_window" | "cooldown";
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

function isMissingRpcError(error: { message?: string; code?: string } | null) {
  if (!error) return false;
  const message = error.message ?? "";
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    /could not find the function/i.test(message) ||
    /function .* does not exist/i.test(message)
  );
}

function toLimitResult(
  limit: RateLimitConfig,
  data: unknown,
  error: { message?: string; code?: string } | null
): RateLimitResult {
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
  return { allowed: true };
}

async function consumeFixedWindow(
  supabase: SupabaseClient,
  scope: string,
  identifierHash: string,
  limit: RateLimitConfig,
  windowSeconds: number
): Promise<RateLimitResult> {
  const { data, error } = await supabase.rpc("consume_rate_limit", {
    p_scope: scope,
    p_identifier_hash: identifierHash,
    p_window_seconds: windowSeconds,
    p_max_requests: limit.maxRequests,
  });
  return toLimitResult(limit, data, error);
}

async function consumeLimit(
  supabase: SupabaseClient,
  scope: string,
  identifierHash: string,
  limit: RateLimitConfig
): Promise<RateLimitResult> {
  const windowSeconds = Math.max(1, Math.floor(limit.windowMs / 1000));
  const strategy = limit.strategy ?? "fixed_window";

  if (strategy !== "cooldown") {
    return consumeFixedWindow(
      supabase,
      scope,
      identifierHash,
      limit,
      windowSeconds
    );
  }

  const { data, error } = await supabase.rpc("consume_rate_limit_cooldown", {
    p_scope: scope,
    p_identifier_hash: identifierHash,
    p_cooldown_seconds: windowSeconds,
  });

  // 짧은 cooldown을 fixed-window로 폴백하면 epoch 경계에서 쿨다운 안 2회가 다시 통과한다.
  // RPC 미배포/스키마 캐시 미갱신 시에는 fail-closed (unavailable)로 막는다.
  if (isMissingRpcError(error)) {
    return {
      allowed: false,
      errorMessage: "요청 제한 상태를 확인할 수 없습니다.",
      unavailable: true,
    };
  }

  return toLimitResult(limit, data, error);
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
    const result = await consumeLimit(
      supabase,
      scope,
      identifierHash,
      limit
    );
    if (!result.allowed) return result;
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
  // 익명: IP 해시만. 로그인: IP + user 이중 제한 (같은 limits 프리셋).
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
      strategy: "fixed_window",
    },
    {
      windowMs: 60 * 60 * 1000, // 1시간
      maxRequests: 10,
      message:
        "1시간 동안 최대 10회까지 제보할 수 있습니다. 잠시 후 다시 시도해주세요.",
      priority: 2,
      strategy: "fixed_window",
    },
    {
      windowMs: 15 * 1000, // 15초
      maxRequests: 1,
      message: "잠시 후 다시 시도해주세요. (15초 쿨다운)",
      priority: 3, // 최하위
      // fixed-window 경계에서는 벽시계 15초 안에 2회가 통과할 수 있어 cooldown 사용
      strategy: "cooldown",
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
