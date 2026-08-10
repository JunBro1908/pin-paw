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
  assert.match(card, /\{lostAt\} \/ \{approximateRegion\}/);
  assert.match(card, /시간 정보 없음/);
  assert.match(card, /지역 정보 없음/);
  assert.match(card, />\s*특이사항\s*</);
  assert.match(card, /buildLostCaseTraitTags|traitTags/);
  assert.match(card, /trait_species|trait_size|trait_color/);
  assert.match(card, /item\.note/);
  assert.match(card, /line-clamp-2/);
  assert.doesNotMatch(card, /마지막 확인/);
  assert.match(card, /유실글 보기/);
  assert.match(card, /추천 제보 보기/);
  assert.doesNotMatch(card, /확인할 제보 보기/);
  assert.match(card, /\/my\/lost-posts\/\$\{item\.id\}/);
  assert.match(card, /\/recommend\?lostPostId=\$\{item\.id\}/);
  assert.match(card, /onPrimaryAction\?:/);
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
  const guard = await readFile(
    "src/features/auth/components/AuthGuard.tsx",
    "utf8"
  );
  const tabsLayout = await readFile("src/app/(tabs)/layout.tsx", "utf8");

  assert.match(prompt, /로그인이 필요합니다/);
  assert.match(prompt, /유실글 등록, 내 제보 확인/);
  assert.match(prompt, /href="\/terms"/);
  assert.match(prompt, /href="\/privacy"/);
  assert.doesNotMatch(prompt, /동의하는 것으로 간주됩니다/);
  assert.match(
    prompt,
    /min-h-\[calc\(100dvh-var\(--bottom-nav-height\)-env\(safe-area-inset-bottom/
  );
  assert.match(prompt, /flex-1 flex-col items-center justify-center gap-8/);
  assert.match(prompt, /mt-auto[\s\S]*href="\/terms"/);
  assert.match(guard, /flex min-h-0 w-full flex-1 flex-col/);
  assert.match(
    tabsLayout,
    /flex flex-1 flex-col pb-\[calc\(var\(--bottom-nav-height\)/
  );
});

test("my activity leads with user profile before case carousel", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  assert.match(page, /<AccountSurface/);
  assert.match(page, /<PawAvatar/);
  assert.match(page, /<LostCaseCarousel/);
  assert.ok(
    page.indexOf("<AccountSurface") < page.indexOf("<LostCaseCarousel"),
    "user profile should appear before the case carousel"
  );
  assert.match(page, /ScrollablePanel/);
  assert.match(page, /variant="results"/);
  assert.match(page, /useMySightings\(\)/);
  assert.match(page, /headingAction=/);
  assert.match(page, /heading="내 유실글"/);
  assert.match(page, /primaryAction="detail"/);
  assert.doesNotMatch(page, /LostCaseNextActions/);
});

test("my header exposes settings gear and omits alerts entry", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  const header = page.match(/<header[\s\S]*?<\/header>/);
  assert.ok(header, "my page should have a header");
  assert.match(header[0], /aria-label="설정"/);
  assert.match(header[0], /href="\/my\/settings"/);
  assert.match(header[0], /name="settings"/);
  assert.match(header[0], /내 정보/);
  assert.match(header[0], /flex min-h-11 items-center justify-between/);
  assert.doesNotMatch(header[0], /올린 유실글과 제보를 이어서 관리하세요/);
  assert.doesNotMatch(page, /\/my\/notifications/);
  assert.doesNotMatch(page, />\s*알림\s*</);
  assert.doesNotMatch(page, />\s*설정\s*</);
});

test("my empty lost-post state centers title, copy, and CTA", async () => {
  const page = await readFile("src/app/(tabs)/my/page.tsx", "utf8");
  const emptyBlock = page.match(
    /아직 올린 유실글이 없어요[\s\S]{0,500}?유실글 올리기/
  );
  assert.ok(emptyBlock, "empty lost-post copy and CTA should appear together");
  const container = page.match(
    /<div className="([^"]*items-center[^"]*justify-center[^"]*text-center[^"]*)"[\s\S]*?아직 올린 유실글이 없어요/
  );
  assert.ok(container, "empty lost-post container should center content");
  assert.match(container[1], /flex-col/);
  assert.doesNotMatch(container[1], /sm:text-left|sm:justify-start/);
  assert.match(page, /href="\/my\/lost-posts\/new"[\s\S]{0,200}?유실글 올리기/);
  assert.match(emptyBlock[0], /min-h-11/);
});

test("recommend empty lost-post state centers CTA", async () => {
  const page = await readFile("src/app/(tabs)/recommend/page.tsx", "utf8");
  const container = page.match(
    /<div className="([^"]*items-center[^"]*justify-center[^"]*text-center[^"]*)"[\s\S]*?아직 올린 유실글이 없어요[\s\S]{0,400}?유실글 올리기/
  );
  assert.ok(container, "recommend empty lost-post state should be centered");
  assert.match(container[1], /flex-col/);
  assert.match(page, /href="\/my\/lost-posts\/new"[\s\S]{0,200}?유실글 올리기/);
});

test("my sighting empty state stays centered with hierarchy", async () => {
  const list = await readFile(
    "src/features/sightings/components/MySightingList.tsx",
    "utf8"
  );
  const container = list.match(
    /<div className="([^"]*items-center[^"]*justify-center[^"]*text-center[^"]*)"[\s\S]*?아직 작성한 제보가 없어요[\s\S]{0,400}?제보하러 가기/
  );
  assert.ok(container, "my sighting empty state should be centered");
  assert.match(container[1], /flex-col/);
  assert.match(list, /min-h-11/);
});

test("my sighting cards pair quiet edit and delete icon actions", async () => {
  const card = await readFile(
    "src/features/sightings/components/MySightingCard.tsx",
    "utf8"
  );
  assert.match(card, /aria-label="제보 수정"/);
  assert.match(card, /aria-label="삭제"/);
  assert.match(card, /\/my\/sightings\/\$\{item\.id\}\/edit/);
  assert.match(card, /지도에서 보기/);
  assert.match(card, /formatSeoulLostDateTime/);
  assert.match(card, /buildTraitTags/);
  assert.match(card, /bg-surface-soft text-text-sub rounded-lg/);
  assert.match(card, /bg-border-subtle mx-0\.5 h-5 w-px/);
  assert.match(card, /grid grid-cols-\[6rem_minmax\(0,1fr\)\] gap-3/);
  assert.match(
    card,
    /grid grid-cols-\[minmax\(0,1fr\)_auto\] items-start gap-1/
  );
  assert.match(card, /flex shrink-0 items-center/);
  assert.doesNotMatch(card, />\s*목격 제보\s*</);
  assert.match(card, /const traitTagsMarkup/);
  const renderedCard = card.slice(card.indexOf("return ("));
  assert.match(
    renderedCard,
    /\{approximateRegion\}[\s\S]*\{actionButtons\}[\s\S]*\{occurredAt\}[\s\S]*\{traitTagsMarkup\}/
  );
  assert.match(card, /min-h-10 w-full items-center justify-center/);
  assert.match(card, /flex flex-nowrap gap-1 overflow-hidden/);
  assert.match(card, /shrink-0/);
  assert.doesNotMatch(
    card,
    /className="[^"]*truncate[^"]*"[^>]*>\s*\{occurredAt\}/
  );
  assert.match(card, /min-h-11 min-w-11/);
  assert.match(card, /text-text-caption/);
  assert.doesNotMatch(card, /item\.note/);
  assert.doesNotMatch(card, /hour:\s*"2-digit"/);
  assert.doesNotMatch(card, />\s*수정\s*</);
  assert.doesNotMatch(card, /rounded-full border/);
  assert.doesNotMatch(card, /absolute top-3 right-3/);
});
