import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("my activity leads with an active case carousel without next actions", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  assert.match(page, /<LostCaseCarousel/);
  assert.doesNotMatch(page, /LostCaseNextActions/);
  assert.doesNotMatch(page, /다음으로 할 일/);
  assert.match(page, /내 정보/);
  assert.match(page, /aria-label="유실글 올리기"/);
  assert.doesNotMatch(page, /유실 사건 등록/);
  assert.doesNotMatch(page, /지난 유실글/);
  assert.doesNotMatch(page, /<LostPostList/);
});

test("active case card prioritizes cover photo and detail CTA", async () => {
  const card = await readFile(
    "src/features/lost-posts/components/ActiveLostCaseCard.tsx",
    "utf8"
  );
  assert.match(card, /getLostPostCoverUrl/);
  assert.match(card, /마지막 확인/);
  assert.match(card, /유실글 보기/);
  assert.match(card, /추천 제보 보기/);
  assert.doesNotMatch(card, /확인할 제보 보기/);
  assert.match(card, /\/my\/lost-posts\/\$\{item\.id\}/);
  assert.match(card, /\/recommend\?lostPostId=\$\{item\.id\}/);
  assert.doesNotMatch(card, /\?edit=1/);
  assert.doesNotMatch(card, /aria-label="유실글 수정"/);
  assert.match(card, /bg-white/);
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
  assert.doesNotMatch(carousel, /pageIndex \+ 1\}\/\{items\.length/);
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
  assert.match(card, /유실글 보기/);
  assert.doesNotMatch(card, /확인할 제보 보기/);
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
  assert.match(page, /heading="내 유실글"/);
  assert.match(page, /primaryAction="detail"/);
  assert.doesNotMatch(page, /LostCaseNextActions/);
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
