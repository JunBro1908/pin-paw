import {
  createServerSupabaseClient,
  createServerSupabase,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

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
  const supabaseAuth = await createServerSupabaseClient();
  const {
    data: { session },
  } = await supabaseAuth.auth.getSession();

  if (!session) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { searchParams } = new URL(request.url);
  const lostPostId = searchParams.get("lostPostId");
  if (!lostPostId) {
    return fail(ApiErrorCode.VALIDATION_ERROR, "lostPostId는 필수입니다.", 400);
  }

  const radiusKm = Math.min(
    Math.max(0.1, parseFloat(searchParams.get("radiusKm") || "8")),
    100
  );
  const days = Math.min(
    Math.max(1, parseFloat(searchParams.get("days") || "8")),
    365
  );
  const topK = Math.min(
    Math.max(1, parseInt(searchParams.get("topK") || "10", 10)),
    50
  );

  const { data: lostPost, error: lostError } = await supabaseAuth
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .maybeSingle();

  if (lostError) {
    console.error("[recommendations] lost_posts select", lostError);
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }
  if (!lostPost) {
    return fail(ApiErrorCode.NOT_FOUND, "유실글을 찾을 수 없습니다.", 404);
  }

  const supabaseAdmin = createServerSupabase();
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

  const applyFeedback = async (
    rawItems: RecoItem[]
  ): Promise<(RecoItem & { claimedAsMyDog: boolean })[]> => {
    if (rawItems.length === 0) return [];
    const { data: claimsRows } = await supabaseAuth
      .from("lost_post_sighting_claims")
      .select("sighting_id")
      .eq("lost_post_id", lostPostId);

    const claimedSet = new Set(
      (claimsRows ?? []).map((r) => r.sighting_id as string)
    );
    const claimedFirst = [
      ...rawItems.filter((i) => claimedSet.has(i.sightingId)),
      ...rawItems.filter((i) => !claimedSet.has(i.sightingId)),
    ];
    return claimedFirst.map((i) => ({
      ...i,
      claimedAsMyDog: claimedSet.has(i.sightingId),
    }));
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
    console.error("[recommendations] RPC", rpcError);
    return fail(ApiErrorCode.INTERNAL_ERROR, "추천 계산에 실패했습니다.", 500);
  }

  if (items === null) {
    return ok({ status: "pending" as const, items: [] });
  }

  const result = Array.isArray(items)
    ? items
    : (items as unknown[] as RecoItem[]);

  await supabaseAdmin.from("recommendation_cache").upsert(
    {
      lost_post_id: lostPostId,
      cache_key: cacheKey,
      result: result as unknown as object,
      calculated_at: now.toISOString(),
      expires_at: expiresAt.toISOString(),
    },
    { onConflict: "lost_post_id,cache_key" }
  );

  const itemsWithFeedback = await applyFeedback(result);
  return ok({
    status: "ready" as const,
    items: itemsWithFeedback,
    calculatedAt: now.toISOString(),
  });
}
