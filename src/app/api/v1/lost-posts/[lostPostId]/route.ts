import {
  createServerSupabaseClient,
  createServiceRoleSupabase,
  getAuthenticatedUser,
} from "@/shared/supabase/server";
import { ok, fail, ApiErrorCode } from "@/shared/lib/api-response";
import { triggerEmbeddingsProcess } from "@/shared/lib/embeddings-worker";
import { extractColorTokens } from "@/shared/constants/traitColors";
import { normalizeSize } from "@/shared/constants/traitSizes";
import { TRAIT_TAG_IDS } from "@/shared/constants/traitTags";
import {
  isValidUuid,
  parseLostPostUpdateRequest,
} from "@/shared/lib/api-input";
import { readJsonBody } from "@/shared/lib/api-request";
import { createRequestLogger } from "@/shared/lib/structured-log";

const TRAIT_TAGS_MAX_LOST_POST = 8;
type RouteContext = { params: Promise<{ lostPostId: string }> };

/**
 * GET /api/v1/lost-posts/[lostPostId] — 단건 조회 (본인 소유만)
 */
export async function GET(request: Request, context: RouteContext) {
  const logger = createRequestLogger(
    request,
    "/api/v1/lost-posts/[lostPostId]"
  );
  const { lostPostId } = await context.params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
      400
    );
  }
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
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
    logger.error("lost_post.lookup_failed", { error, status: 500 });
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
  const logger = createRequestLogger(
    request,
    "/api/v1/lost-posts/[lostPostId]"
  );
  const { lostPostId } = await context.params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
      400
    );
  }
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
    return fail(
      ApiErrorCode.UNAUTHORIZED,
      "로그인이 필요한 서비스입니다.",
      401
    );
  }

  const bodyResult = await readJsonBody(request);
  if (!bodyResult.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      bodyResult.reason === "body_too_large"
        ? "요청 본문이 너무 큽니다."
        : "JSON 요청 본문이 유효하지 않습니다.",
      bodyResult.reason === "body_too_large" ? 413 : 400
    );
  }
  const parsed = parseLostPostUpdateRequest(bodyResult.value);
  if (!parsed.ok) {
    return fail(
      ApiErrorCode.VALIDATION_ERROR,
      "유실글 수정 요청 형식이 유효하지 않습니다.",
      400
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

  const body = parsed.value;
  const updates: Record<string, unknown> = {};

  if (body.status !== undefined) {
    updates.status = body.status;
  }
  if (body.petName !== undefined) {
    updates.pet_name = body.petName;
  }
  if (body.traitColor !== undefined) {
    updates.trait_color = body.traitColor;
    updates.color_tokens = body.traitColor
      ? extractColorTokens(body.traitColor)
      : [];
  }
  if (body.traitSize !== undefined) {
    updates.trait_size = normalizeSize(body.traitSize) ?? body.traitSize;
  }
  if (body.traitSpecies !== undefined)
    updates.trait_species = body.traitSpecies;
  if (body.traitTags !== undefined) {
    const arr = body.traitTags
      .filter((id) => TRAIT_TAG_IDS.includes(id))
      .slice(0, TRAIT_TAGS_MAX_LOST_POST);
    updates.trait_tags = arr.length ? arr : null;
  }
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
    if (error.code === "23514" && body.status !== undefined) {
      return fail(
        ApiErrorCode.VALIDATION_ERROR,
        "허용되지 않은 상태 변경입니다.",
        409
      );
    }
    logger.error("lost_post.update_failed", { error, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "수정에 실패했습니다.", 500);
  }

  // 특징/메모 수정 시 임베딩 재생성: 1행 pending upsert 후 worker 호출
  const embeddingFieldsChanged =
    body.traitColor !== undefined ||
    body.traitSize !== undefined ||
    body.traitSpecies !== undefined ||
    body.traitTags !== undefined ||
    body.note !== undefined;
  if (embeddingFieldsChanged) {
    const supabaseAdmin = createServiceRoleSupabase();
    await supabaseAdmin
      .from("lost_posts")
      .update({ embedding_status: "pending" })
      .eq("id", lostPostId);
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
    // Stale recommendation cache must not serve pre-edit vectors/traits.
    await supabaseAdmin
      .from("recommendation_cache")
      .delete()
      .eq("lost_post_id", lostPostId);
    triggerEmbeddingsProcess(logger);
  }

  return ok(row);
}

/**
 * DELETE /api/v1/lost-posts/[lostPostId] — 삭제 (본인 소유만, 하드 삭제)
 */
export async function DELETE(request: Request, context: RouteContext) {
  const logger = createRequestLogger(
    request,
    "/api/v1/lost-posts/[lostPostId]"
  );
  const { lostPostId } = await context.params;
  if (!isValidUuid(lostPostId)) {
    return fail(
      ApiErrorCode.INVALID_PARAMS,
      "유효한 lostPostId가 필요합니다.",
      400
    );
  }
  const supabaseAuth = await createServerSupabaseClient();
  const { user } = await getAuthenticatedUser(supabaseAuth);
  if (!user) {
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

  const supabaseAdmin = createServiceRoleSupabase();
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
    logger.error("lost_post.delete_failed", { error, status: 500 });
    return fail(ApiErrorCode.INTERNAL_ERROR, "삭제에 실패했습니다.", 500);
  }

  return ok({ deleted: true });
}
