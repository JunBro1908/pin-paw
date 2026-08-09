import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const activeCardPath =
  "src/features/lost-posts/components/ActiveLostCaseCard.tsx";
const compactCardPath = "src/features/lost-posts/components/LostPostCard.tsx";
const detailPagePath = "src/app/(tabs)/my/lost-posts/[lostPostId]/page.tsx";
const mapDetailPath = "src/features/map/components/MapDetailSheet.tsx";

test("active lost-post card presents lost time and approximate region before traits", async () => {
  const card = await readFile(activeCardPath, "utf8");

  assert.match(card, /formatSeoulLostDateTime/);
  assert.match(card, /item\.lost_at/);
  assert.match(card, /item\.approximate_region/);
  assert.match(card, /잃어버린 시간/);
  assert.match(card, /잃어버린 지역/);
  assert.match(card, /시간 정보 없음/);
  assert.match(card, /지역 정보 없음/);
  assert.ok(
    card.indexOf('<dt className="text-text-caption shrink-0">잃어버린 시간</dt>') <
      card.indexOf('<ul className="mt-2 flex flex-wrap gap-1.5">'),
    "time should be presented before trait chips"
  );
  assert.doesNotMatch(card, /item\.created_at|item\.lost_location/);
});

test("lost-post presentation surfaces reuse the shared dog size formatter", async () => {
  const [activeCard, compactCard, detailPage, mapDetail] = await Promise.all([
    readFile(activeCardPath, "utf8"),
    readFile(compactCardPath, "utf8"),
    readFile(detailPagePath, "utf8"),
    readFile(mapDetailPath, "utf8"),
  ]);

  for (const source of [activeCard, compactCard, detailPage, mapDetail]) {
    assert.match(source, /formatDogSizeLabel/);
    assert.doesNotMatch(source, /SIZE_LABELS\[/);
  }
});

test("owner and map lost-post details hide unknown species sentinels", async () => {
  const [detailPage, mapDetail] = await Promise.all([
    readFile(detailPagePath, "utf8"),
    readFile(mapDetailPath, "utf8"),
  ]);

  assert.match(detailPage, /rawTraitSpecies !== SPECIES_UNKNOWN/);
  assert.match(detailPage, /rawTraitSpecies !== "모름"/);
  assert.match(mapDetail, /SPECIES_UNKNOWN/);
  assert.match(mapDetail, /rawTraitSpecies !== SPECIES_UNKNOWN/);
  assert.match(mapDetail, /rawTraitSpecies !== "모름"/);
});

test("lost-post cards keep actions while protecting compact mobile metadata", async () => {
  const [activeCard, compactCard, detailPage] = await Promise.all([
    readFile(activeCardPath, "utf8"),
    readFile(compactCardPath, "utf8"),
    readFile(detailPagePath, "utf8"),
  ]);

  assert.match(activeCard, /min-w-0/);
  assert.match(activeCard, /truncate/);
  assert.match(activeCard, /flex flex-wrap/);
  assert.match(compactCard, /min-w-0/);
  assert.match(compactCard, /truncate/);
  assert.match(activeCard, /유실글 보기/);
  assert.match(activeCard, /추천 제보 보기/);
  assert.match(activeCard, /ShareLostPostButton/);
  assert.match(detailPage, /aria-label="수정"/);
  assert.match(detailPage, /유실글 삭제/);
  assert.match(detailPage, /\/recommend\?lostPostId=\$\{item\.id\}/);
});
