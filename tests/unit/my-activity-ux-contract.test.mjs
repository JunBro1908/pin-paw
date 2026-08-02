import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("my activity leads with an active case carousel and next actions", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  assert.match(page, /<LostCaseCarousel/);
  assert.match(page, /<LostCaseNextActions/);
  assert.match(page, /내 활동/);
  assert.match(page, /유실글 올리기/);
  assert.doesNotMatch(page, /유실 사건 등록/);
  assert.doesNotMatch(page, /지난 유실글/);
  assert.doesNotMatch(page, /<LostPostList/);
});

test("active case card prioritizes cover photo, edit, and find CTA", async () => {
  const card = await readFile(
    "src/features/lost-posts/components/ActiveLostCaseCard.tsx",
    "utf8"
  );
  assert.match(card, /getLostPostCoverUrl/);
  assert.match(card, /마지막 확인/);
  assert.match(card, /추천 제보 보기/);
  assert.doesNotMatch(card, /확인할 제보 보기/);
  assert.match(card, /\/recommend\?lostPostId=\$\{item\.id\}/);
  assert.match(card, /\?edit=1/);
  assert.match(card, /aria-label="유실글 수정"/);
  assert.match(card, /bg-surface/);
  assert.doesNotMatch(card, /bg-black(?!\/)/);
});

test("lost case carousel is a full-width page-snap pager", async () => {
  const carousel = await readFile(
    "src/features/lost-posts/components/LostCaseCarousel.tsx",
    "utf8"
  );
  const css = await readFile("src/app/globals.css", "utf8");
  assert.match(carousel, /page-snap-carousel/);
  assert.match(carousel, /page-snap-slide/);
  assert.match(carousel, /headingAction/);
  assert.match(carousel, /compact=\{false\}/);
  assert.match(carousel, /<ActiveLostCaseCard/);
  assert.match(css, /\.page-snap-carousel\s*\{/);
  assert.match(css, /scroll-snap-type:\s*x\s+mandatory/);
  assert.match(css, /\.page-snap-slide\s*\{/);
  assert.match(css, /flex:\s*0\s+0\s+100%/);
  assert.match(css, /min-width:\s*100%/);
  assert.match(css, /scroll-snap-stop:\s*always/);
  assert.doesNotMatch(carousel, /w-\[min\(100%,18\.5rem\)\]/);
  assert.doesNotMatch(carousel, /basis-4\/5|w-80|w-\[80%\]/);
  assert.doesNotMatch(carousel, /compact=\{items\.length > 1\}/);
  assert.doesNotMatch(css, /flex:\s*0\s+0\s+80%/);
});

test("active case card never uses compact peek widths", async () => {
  const card = await readFile(
    "src/features/lost-posts/components/ActiveLostCaseCard.tsx",
    "utf8"
  );
  assert.doesNotMatch(card, /w-\[min\(100%,18\.5rem\)\]/);
  assert.match(card, /추천 제보 보기/);
  assert.doesNotMatch(card, /확인할 제보 보기/);
});

test("next actions cover notifications, case management edit, and map focus", async () => {
  const actions = await readFile(
    "src/features/lost-posts/components/LostCaseNextActions.tsx",
    "utf8"
  );
  assert.match(actions, /지도에서 흔적 보기/);
  assert.match(actions, /알림 확인/);
  assert.match(actions, /사건 정보 관리/);
  assert.match(actions, /\/map\?lostPostId=\$\{lostPostId\}/);
  assert.match(actions, /\/my\/notifications/);
  assert.match(actions, /\/my\/lost-posts\/\$\{lostPostId\}\?edit=1/);
});

test("login prompt states the purpose and links policies", async () => {
  const prompt = await readFile(
    "src/features/auth/components/LoginPrompt.tsx",
    "utf8"
  );
  assert.match(prompt, /로그인이 필요합니다/);
  assert.match(prompt, /유실글 등록, 내 제보 확인/);
  assert.match(prompt, /href="\/terms"/);
  assert.match(prompt, /href="\/privacy"/);
  assert.doesNotMatch(prompt, /동의하는 것으로 간주됩니다/);
});

test("my activity leads with user profile before case carousel", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  assert.match(page, /<AccountSurface/);
  assert.match(page, /<LostCaseCarousel/);
  assert.ok(
    page.indexOf("<AccountSurface") < page.indexOf("<LostCaseCarousel"),
    "user profile should appear before the case carousel"
  );
  assert.match(page, /ScrollablePanel/);
  assert.match(page, /variant="list"/);
  assert.match(page, /useMySightings\(\)/);
  assert.match(page, /headingAction=/);
  assert.match(page, /heading="내 유실 사건"/);
});

test("my sighting cards use a top-right edit icon instead of text", async () => {
  const card = await readFile(
    "src/features/sightings/components/MySightingCard.tsx",
    "utf8"
  );
  assert.match(card, /aria-label="제보 수정"/);
  assert.match(card, /\/my\/sightings\/\$\{item\.id\}\/edit/);
  assert.doesNotMatch(card, />\s*수정\s*</);
});
