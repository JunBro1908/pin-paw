import {
  createServerSupabaseClient,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";

/**
 * GET /api/v1/me/lost-posts/[lostPostId]/sighting-claims
 * 해당 유실글에서 "내 강아지로 인정"한 sighting_id 목록 (소유자만)
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { lostPostId } = await params;
  if (!lostPostId) {
    return fail(ApiErrorCode.INVALID_PARAMS, "lostPostId가 필요합니다.", 400);
  }

  const { data: lostPost } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!lostPost) {
    return fail(
      ApiErrorCode.NOT_FOUND,
      "유실글을 찾을 수 없거나 권한이 없습니다.",
      404
    );
  }

  const { data: rows, error } = await supabase
    .from("lost_post_sighting_claims")
    .select("sighting_id")
    .eq("lost_post_id", lostPostId);

  if (error) {
    console.error("[sighting-claims] GET error:", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  const sightingIds = (rows ?? []).map((r) => r.sighting_id as string);
  return ok({ sightingIds });
}

/**
 * POST /api/v1/me/lost-posts/[lostPostId]/sighting-claims
 * body: { sightingId: string } — "내 강아지로 인정" 추가
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ lostPostId: string }> }
) {
  const supabase = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabase);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const { lostPostId } = await params;
  if (!lostPostId) {
    return fail(ApiErrorCode.INVALID_PARAMS, "lostPostId가 필요합니다.", 400);
  }

  const { data: lostPost } = await supabase
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!lostPost) {
    return fail(
      ApiErrorCode.NOT_FOUND,
      "유실글을 찾을 수 없거나 권한이 없습니다.",
      404
    );
  }

  let body: { sightingId?: string };
  try {
    body = await request.json();
  } catch {
    return fail(ApiErrorCode.VALIDATION_ERROR, "JSON 본문이 필요합니다.", 400);
  }

  const sightingId = body.sightingId;
  if (!sightingId || typeof sightingId !== "string") {
    return fail(ApiErrorCode.VALIDATION_ERROR, "sightingId가 필요합니다.", 400);
  }

  const { error } = await supabase.from("lost_post_sighting_claims").upsert(
    {
      lost_post_id: lostPostId,
      sighting_id: sightingId,
      claimed_at: new Date().toISOString(),
    },
    { onConflict: "lost_post_id,sighting_id" }
  );

  if (error) {
    console.error("[sighting-claims] POST error:", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "저장에 실패했습니다.", 500);
  }

  return ok({ success: true });
}
