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

test("detail page opens edit modal from query and prevents re-entry", async () => {
  const page = await readFile(
    "src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx",
    "utf8"
  );
  assert.match(page, /searchParams\.get\("edit"\) === "1"/);
  assert.match(page, /editSubmitting/);
  assert.match(page, /invalidateMyLostPostsCache/);
  assert.match(page, /aria-label="수정"/);
  assert.match(page, /surface-light/);
  assert.match(page, /text-text-main/);
  assert.match(page, /placeholder:text-text-caption/);
  assert.match(page, /bg-action-primary text-action-on-primary/);
  assert.match(page, /추천 제보 보기/);
  assert.match(page, /<BackLink/);
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
  for (const path of [
    "src/app/(tabs)/my/settings/page.tsx",
    "src/app/(tabs)/my/notifications/page.tsx",
    "src/app/(tabs)/my/sightings/page.tsx",
    "src/app/(tabs)/my/lost-posts/new/page.tsx",
  ]) {
    const source = await readFile(path, "utf8");
    assert.match(source, /<BackLink href="\/my">내 정보<\/BackLink>/);
  }
});
