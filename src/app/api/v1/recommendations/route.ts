import {
  createServerSupabaseClient,
  createServiceRoleSupabase,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { parseRecommendationQuery } from "@/shared/lib/api-input";
import { createRequestLogger } from "@/shared/lib/structured-log";
import { protectRecommendationLocations } from "@/shared/lib/privacy-location";

const CACHE_TTL_SECONDS = 180;

function buildCacheKey(radiusKm: number, days: number, topK: number): string {
  return `${radiusKm}_${days}_${topK}`;
}

/**
 * GET /api/v1/recommendations
 * Query: lostPostId (required), radiusKm (default 8), days (default 8), topK (default 10)
 * 인증 필수. lostPostId 소유자만 조회 가능. 캐시 TTL 180초.
 */
export async function GET(request: Request) {
  const logger = createRequestLogger(request, "/api/v1/recommendations");
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const parsed = parseRecommendationQuery({
    lostPostId: searchParams.get("lostPostId"),
    radiusKm: searchParams.get("radiusKm"),
    days: searchParams.get("days"),
    topK: searchParams.get("topK"),
  });
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "추천 조회 파라미터가 유효하지 않습니다.",
      400
    );
  }
  const { lostPostId, radiusKm, days, topK } = parsed.value;

  const { data: lostPost, error: lostError } = await supabaseAuth
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (lostError) {
    logger.error("recommendation.lost_post_lookup_failed", {
      error: lostError,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }
  if (!lostPost) {
    return fail(ApiErrorCode.NOT_FOUND, "유실글을 찾을 수 없습니다.", 404);
  }

  const supabaseAdmin = createServiceRoleSupabase();
  const cacheKey = buildCacheKey(radiusKm, days, topK);
  const now = new Date();
  const expiresAt = new Date(now.getTime() + CACHE_TTL_SECONDS * 1000);

  const { data: cached, error: cacheError } = await supabaseAdmin
    .from("recommendation_cache")
    .select("result, calculated_at, expires_at")
    .eq("lost_post_id", lostPostId)
    .eq("cache_key", cacheKey)
    .gt("expires_at", now.toISOString())
    .maybeSingle();

  type RecoItem = {
    sightingId: string;
    similarity: number;
    photoKeys: string[];
    occurredAt: string;
    lat: number;
    lng: number;
  };
  type ProtectedRecoItem = Omit<RecoItem, "lat" | "lng"> & {
    lat: number;
    lng: number;
    locationPrecision: "approximate";
    claimedAsMyDog: boolean;
  };

  const applyFeedback = async (
    rawItems: RecoItem[]
  ): Promise<ProtectedRecoItem[]> => {
    if (rawItems.length === 0) return [];
    const { data: visibleIds, error: visibilityError } = await supabaseAuth.rpc(
      "filter_blocked_sighting_ids",
      { p_sighting_ids: rawItems.map((item) => item.sightingId) }
    );
    if (visibilityError) {
      logger.error("recommendation.block_filter_failed", {
        error: visibilityError,
        status: 500,
      });
      return [];
    }
    const visibleSet = new Set(
      Array.isArray(visibleIds)
        ? visibleIds.filter((id): id is string => typeof id === "string")
        : []
    );
    const visibleItems = rawItems.filter((item) =>
      visibleSet.has(item.sightingId)
    );
    if (visibleItems.length === 0) return [];

    const { data: claimsRows } = await supabaseAuth
      .from("lost_post_sighting_claims")
      .select("sighting_id")
      .eq("lost_post_id", lostPostId);

    const claimedSet = new Set(
      (claimsRows ?? []).map((r) => r.sighting_id as string)
    );
    const claimedFirst = [
      ...visibleItems.filter((i) => claimedSet.has(i.sightingId)),
      ...visibleItems.filter((i) => !claimedSet.has(i.sightingId)),
    ];
    return protectRecommendationLocations(
      claimedFirst.map((i) => ({
        ...i,
        claimedAsMyDog: claimedSet.has(i.sightingId),
      }))
    );
  };

  if (!cacheError && cached?.result) {
    const rawItems = cached.result as RecoItem[];
    const items = await applyFeedback(rawItems);
    return ok({
      status: "ready" as const,
      items,
      calculatedAt: cached.calculated_at ?? undefined,
    });
  }

  const { data: items, error: rpcError } = await supabaseAdmin.rpc(
    "get_recommendations_for_lost_post",
    {
      p_lost_post_id: lostPostId,
      p_radius_km: radiusKm,
      p_days: days,
      p_top_k: topK,
    }
  );

  if (rpcError) {
    logger.error("recommendation.calculation_failed", {
      error: rpcError,
      status: 500,
    });
    return fail(ApiErrorCode.INTERNAL_ERROR, "추천 계산에 실패했습니다.", 500);
  }

  if (items === null) {
    return ok({ status: "pending" as const, items: [] });
  }

  const result = Array.isArray(items)
    ? items
    : (items as unknown[] as RecoItem[]);

  const { error: cacheWriteError } = await supabaseAdmin
    .from("recommendation_cache")
    .upsert(
      {
        lost_post_id: lostPostId,
        cache_key: cacheKey,
        result: result as unknown as object,
        calculated_at: now.toISOString(),
        expires_at: expiresAt.toISOString(),
      },
      { onConflict: "lost_post_id,cache_key" }
    );
  // Cache/notification side effects must not hide already-computed recommendations.
  if (cacheWriteError) {
    logger.error("recommendation.cache_write_failed", {
      error: cacheWriteError,
      status: 500,
    });
  }

  const itemsWithFeedback = await applyFeedback(result);
  return ok({
    status: "ready" as const,
    items: itemsWithFeedback,
    calculatedAt: now.toISOString(),
  });
}
