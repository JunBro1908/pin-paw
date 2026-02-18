import {
  createServerSupabaseClient,
  createServerSupabase,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";

type RouteContext = { params: Promise<{ lostPostId: string }> };

/**
 * GET /api/v1/lost-posts/[lostPostId] — 단건 조회 (본인 소유만)
 */
export async function GET(request: Request, context: RouteContext) {
  const { lostPostId } = await context.params;
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

  const { data: row, error } = await supabaseAuth
    .from("lost_posts")
    .select("*")
    .eq("id", lostPostId)
    .maybeSingle();

  if (error) {
    console.error("[lost-posts GET single]", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "조회에 실패했습니다.", 500);
  }

  if (!row) {
    return fail(ApiErrorCode.NOT_FOUND, "유실글을 찾을 수 없습니다.", 404);
  }

  return ok(row);
}

/**
 * PATCH /api/v1/lost-posts/[lostPostId] — 상태·특징 수정 (본인 소유만)
 * Body: { status?, traitColor?, traitSize?, traitSpecies?, note? }
 */
export async function PATCH(request: Request, context: RouteContext) {
  const { lostPostId } = await context.params;
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

  const { data: existing } = await supabaseAuth
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .maybeSingle();

  if (!existing) {
    return fail(ApiErrorCode.NOT_FOUND, "유실글을 찾을 수 없습니다.", 404);
  }

  const body = await request.json().catch(() => ({}));
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    const status = body.status;
    if (!["searching", "found", "closed"].includes(status)) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "status는 searching, found, closed 중 하나여야 합니다.",
        400
      );
    }
    updates.status = status;
  }
  if (body.traitColor !== undefined) updates.trait_color = body.traitColor;
  if (body.traitSize !== undefined) updates.trait_size = body.traitSize;
  if (body.traitSpecies !== undefined)
    updates.trait_species = body.traitSpecies;
  if (body.note !== undefined) updates.note = body.note;
  if (Object.keys(updates).length === 0) {
    const { data: current } = await supabaseAuth
      .from("lost_posts")
      .select("*")
      .eq("id", lostPostId)
      .single();
    return ok(current ?? existing);
  }

  const { data: row, error } = await supabaseAuth
    .from("lost_posts")
    .update(updates)
    .eq("id", lostPostId)
    .select()
    .single();

  if (error) {
    console.error("[lost-posts PATCH]", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "수정에 실패했습니다.", 500);
  }

  // 특징/메모 수정 시 임베딩 재생성: pending upsert 후 worker 호출
  const supabaseAdmin = createServerSupabase();
  await supabaseAdmin.from("embeddings").upsert(
    {
      entity_type: "lost_post",
      entity_id: lostPostId,
      modality: "text",
      status: "pending",
      retry_count: 0,
    },
    { onConflict: "entity_type,entity_id,modality" }
  );
  triggerEmbeddingsProcess(request);

  return ok(row);
}

/**
 * DELETE /api/v1/lost-posts/[lostPostId] — 삭제 (본인 소유만, 하드 삭제)
 */
export async function DELETE(request: Request, context: RouteContext) {
  const { lostPostId } = await context.params;
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

  const { data: existing } = await supabaseAuth
    .from("lost_posts")
    .select("id")
    .eq("id", lostPostId)
    .maybeSingle();

  if (!existing) {
    return fail(ApiErrorCode.NOT_FOUND, "유실글을 찾을 수 없습니다.", 404);
  }

  const supabaseAdmin = createServerSupabase();
  await supabaseAdmin
    .from("embeddings")
    .delete()
    .eq("entity_type", "lost_post")
    .eq("entity_id", lostPostId);

  const { error } = await supabaseAuth
    .from("lost_posts")
    .delete()
    .eq("id", lostPostId);

  if (error) {
    console.error("[lost-posts DELETE]", error);
    return fail(ApiErrorCode.INTERNAL_ERROR, "삭제에 실패했습니다.", 500);
  }

  return ok({ deleted: true });
}
