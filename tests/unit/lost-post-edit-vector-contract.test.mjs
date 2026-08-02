import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("lost post PATCH requeues embeddings and clears recommendation cache", async () => {
  const route = await readFile(
    "src/app/api/v1/lost-posts/[lostPostId]/route.ts",
    "utf8"
  );
  assert.match(route, /embeddingFieldsChanged/);
  assert.match(route, /embedding_status:\s*"pending"/);
  assert.match(route, /from\("embeddings"\)\.upsert/);
  assert.match(route, /from\("recommendation_cache"\)/);
  assert.match(route, /\.delete\(\)/);
  assert.match(route, /triggerEmbeddingsProcess/);
});

test("detail page routes edit to full-page form like sighting edit", async () => {
  const page = await readFile(
    "src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx",
    "utf8"
  );
  const editPage = await readFile(
    "src/app/(tabs)/my/lost-posts/[lostPostId]/edit/page.tsx",
    "utf8"
  );

  assert.match(page, /searchParams\.get\("edit"\) === "1"/);
  assert.match(page, /router\.replace\(`\/my\/lost-posts\/\$\{lostPostId\}\/edit`\)/);
  assert.match(page, /aria-label="수정"/);
  assert.match(page, /\/my\/lost-posts\/\$\{item\.id\}\/edit/);
  assert.match(page, /surface-light/);
  assert.match(page, /text-text-main/);
  assert.match(page, /추천 제보 보기/);
  assert.match(page, /<BackLink/);
  assert.doesNotMatch(page, /showEditModal/);
  assert.doesNotMatch(page, /editSubmitting/);
  assert.doesNotMatch(page, /유실글 수정/);
  assert.doesNotMatch(page, /aria-label="대표 사진 변경"/);

  assert.match(editPage, /<BackLink href="\/my">내 정보<\/BackLink>/);
  assert.match(editPage, /유실글 수정/);
  assert.match(editPage, /<LostPostEditForm/);
});

test("lost post edit form mirrors sighting edit surface and keeps cover replace", async () => {
  const [editForm, sightingEdit, optional] = await Promise.all([
    readFile(
      "src/features/lost-posts/components/LostPostEditForm.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingEditForm.tsx",
      "utf8"
    ),
    readFile(
      "src/features/sightings/components/SightingOptionalDetails.tsx",
      "utf8"
    ),
  ]);
  const route = await readFile(
    "src/app/api/v1/lost-posts/[lostPostId]/route.ts",
    "utf8"
  );

  assert.match(editForm, /<SightingOptionalDetails/);
  assert.match(editForm, /maxTags=\{MAX_EDIT_TAGS\}/);
  assert.match(editForm, /idPrefix="lost-edit"/);
  assert.match(editForm, /사진 \(1장\)/);
  assert.match(editForm, /aria-label="대표 사진 변경"/);
  assert.match(editForm, /prepareSubmission/);
  assert.match(editForm, /fingerprintUploadFile/);
  assert.match(editForm, /rememberUploadIntent/);
  assert.match(editForm, /markUploadCompleted/);
  assert.match(editForm, /purpose:\s*"lost_cover"/);
  assert.match(editForm, /coverPhotoKey/);
  assert.match(editForm, /saving/);
  assert.match(editForm, /수정 저장/);
  assert.match(editForm, />\s*취소\s*</);
  assert.match(
    editForm,
    /sticky bottom-\[calc\(var\(--bottom-nav-height\)\+env\(safe-area-inset-bottom\)\+0\.75rem\)\]/
  );
  assert.match(editForm, /min-h-12 flex-1 rounded-2xl/);
  assert.match(editForm, /min-h-12 flex-\[1\.4\] rounded-2xl/);
  assert.match(editForm, /aspect-4\/3 max-h-80/);
  assert.match(editForm, /border-2 border-dashed/);
  assert.match(editForm, /선택한 사진 제거/);
  assert.match(editForm, /<option value="searching">찾는 중<\/option>/);
  assert.match(editForm, /<option value="found">찾았어요<\/option>/);
  assert.doesNotMatch(editForm, /<option value="closed">마감<\/option>/);

  assert.match(sightingEdit, /수정 저장/);
  assert.match(optional, /maxTags/);
  assert.match(optional, /idPrefix/);

  assert.match(route, /coverPhotoKey/);
  assert.match(route, /verifyUploadIntents/);
  assert.match(route, /purpose:\s*"lost_cover"/);
  assert.match(route, /cover_photo_key/);
  assert.match(route, /consumed_by_type:\s*"lost_post"/);
});

test("recommend picker uses carousel without edit affordance", async () => {
  const page = await readFile("src/app/(tabs)/recommend/page.tsx", "utf8");
  assert.match(page, /<LostCaseCarousel/);
  assert.doesNotMatch(page, /\?edit=1/);
  assert.doesNotMatch(page, /aria-label="유실글 수정"/);
  assert.doesNotMatch(page, /<LostPostCard/);
});

test("shared BackLink keeps 44px targets across my chrome", async () => {
  const backLink = await readFile("src/shared/ui/BackLink.tsx", "utf8");
  assert.match(backLink, /min-h-11/);
  assert.match(backLink, /text-action-primary/);
  assert.match(backLink, /text-sm/);
  assert.match(backLink, /no-underline/);
  assert.match(backLink, /hover:no-underline/);
  assert.doesNotMatch(backLink, /hover:underline/);
  for (const path of [
    "src/app/(tabs)/my/settings/page.tsx",
    "src/app/(tabs)/my/sightings/page.tsx",
    "src/app/(tabs)/my/lost-posts/new/page.tsx",
    "src/app/(tabs)/my/lost-posts/[lostPostId]/edit/page.tsx",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /<BackLink href="\/my">내 정보<\/BackLink>/);
  }
});

test("lost post detail uses share icon and omits status history UI", async () => {
  const page = await readFile(
    "src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx",
    "utf8"
  );
  assert.match(page, /ShareLostPostButton/);
  assert.match(page, /lostPostId=\{item\.id\}/);
  assert.doesNotMatch(page, /navigator\.share/);
  assert.doesNotMatch(page, /LostPostStatusHistory/);
  assert.doesNotMatch(page, /상태 이력/);
  assert.doesNotMatch(page, />\s*공유\s*</);
});
